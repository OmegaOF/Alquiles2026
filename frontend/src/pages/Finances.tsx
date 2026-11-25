import {
  RecordCollection,
  RecordField,
  RecordRow,
  useListPreference,
} from "../components/RecordList";
import { RecordStatus, StatusIndicator } from "../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { PropertySelect } from "../components/PropertySelect";
import {
  SearchSelect,
  personOption,
  unitOption,
} from "../components/SearchSelect";
import { confirmFormDiscard } from "../components/Form";
import type { Person, Property, User } from "../types";
import type { Contract } from "../tenancy";
import type { Receipt } from "../utilities";
import { showDate } from "../tenancy";
import { Field, ErrorMessage, errorText } from "../components/Form";
import { usePropertyData } from "./tenancy/Shared";
import { FinanceForm } from "./finances/Forms";
import {
  money,
  financeStates,
  movementNames,
  summaryLabels,
  exactCents,
  exactAmount,
} from "../finances";
import type {
  FinanceData,
  FinanceCatalogs,
  Catalog,
  Expense,
} from "../finances";

const tabs = [
  ["summary", "Resumen económico"],
  ["receivable", "Por cobrar"],
  ["receive", "Registrar pago"],
  ["debts", "Deudas pendientes"],
  ["history", "Historial de pagos"],
  ["advances", "Anticipos"],
  ["guarantees", "Garantías"],
  ["expenses", "Gastos registrados"],
  ["disbursements", "Pagos realizados"],
  ["services", "Recuperación de servicios"],
] as const;
const empty: FinanceData = {
  obligations: [],
  movements: [],
  expenses: [],
  summary: [],
  history: [],
};
export function Finances({
  user,
  properties,
  people,
  initialPropertyId,
  initialObligationId,
  onPropertyChange,
  section,
  onCapital,
  onReminders,
}: {
  user: User;
  properties: Property[];
  people: Person[];
  initialPropertyId?: number;
  initialObligationId?: number;
  onPropertyChange?: (id: number) => void;
  section?: "receivable" | "debts" | "expenses";
  onCapital?: (propertyId: number) => void;
  onReminders?: (propertyId: number) => void;
}) {
  const listId = `finances:${section ?? "all"}`;
  const activeForm = useRef<HTMLDivElement>(null);
  const [savedProperty, saveProperty] = useListPreference(`${listId}:house`, 0);
  const [propertyId, setPropertyId] = useState(
    initialPropertyId || savedProperty || properties[0]?.id || 0,
  );
  const criteria = `${listId}:${propertyId}`;
  const [tab, setTab] = useListPreference(
    initialObligationId ? undefined : `${criteria}:tab`,
    section ?? "summary",
  );
  const [data, setData] = useState<FinanceData>(empty),
    [catalogs, setCatalogs] = useState<FinanceCatalogs>({
      methods: [],
      categories: [],
    }),
    [contracts, setContracts] = useState<Contract[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [action, setAction] = useState<{ kind: string; id?: number } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [personFilter, setPersonFilter] = useListPreference(
      `${criteria}:personFilter`,
      0,
    ),
    [obligationFilter, setObligationFilter] = useListPreference(
      initialObligationId ? undefined : `${criteria}:obligation`,
      initialObligationId || 0,
    ),
    [unitFilter, setUnitFilter] = useListPreference(
      `${criteria}:unitFilter`,
      "",
    ),
    [contractFilter, setContractFilter] = useListPreference(
      `${criteria}:contractFilter`,
      0,
    ),
    [conceptFilter, setConceptFilter] = useListPreference(
      `${criteria}:conceptFilter`,
      "",
    ),
    [currencyFilter, setCurrencyFilter] = useListPreference(
      `${criteria}:currencyFilter`,
      "",
    ),
    [fromFilter, setFromFilter] = useListPreference(
      `${criteria}:fromFilter`,
      "",
    ),
    [toFilter, setToFilter] = useListPreference(`${criteria}:toFilter`, "");
  const seq = useRef(0),
    current = useRef(propertyId);
  current.current = propertyId;
  const related = usePropertyData(
    propertyId,
    people,
    user.role === "general_admin",
  );
  const admin = ["general_admin", "property_admin"].includes(user.role),
    canWrite = user.role !== "owner";
  const base = `/properties/${propertyId}/finances`;
  async function load() {
    if (!propertyId || current.current !== propertyId) return;
    const request = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const [d, cat, c, r] = await Promise.all([
        api<FinanceData>(base),
        api<FinanceCatalogs>("/finances/catalogs"),
        api<Contract[]>("/contracts"),
        api<Receipt[]>(`/utility-receipts?property_id=${propertyId}`),
      ]);
      if (request === seq.current) {
        setData(d);
        setCatalogs(cat);
        setContracts(c.filter((c) => c.resolved_property_id === propertyId));
        setReceipts(r);
      }
    } catch (e) {
      if (request === seq.current) setError(errorText(e));
    } finally {
      if (request === seq.current) setBusy(false);
    }
  }
  useEffect(() => {
    setData(empty);
    setAction(null);
    setNotice("");
    void load();
    return () => {
      seq.current++;
    };
  }, [propertyId]);
  const name = (id: number | null) =>
    related.candidates.find((p) => p.id === id)?.full_name ||
    (id ? `Persona registrada n.º ${id}` : "Sin indicar");
  const unit = (id: number | null) =>
    id
      ? related.units.find((u) => u.id === id)?.name || `Cuarto n.º ${id}`
      : "Casa completa";
  const open = (kind: string, id?: number) => {
    setAction({ kind, id });
    setNotice("");
  };
  async function saved() {
    await load();
    setAction(null);
    setNotice(
      "Operación registrada. Los saldos e historial están actualizados.",
    );
  }
  const obligations = data.obligations.filter(
    (o) =>
      (!obligationFilter || obligationFilter === o.id) &&
      (!personFilter || o.person_id === personFilter) &&
      (!unitFilter ||
        (unitFilter === "whole"
          ? o.unit_id === null
          : String(o.unit_id) === unitFilter)) &&
      (!contractFilter || o.contract_id === contractFilter) &&
      (!conceptFilter ||
        (conceptFilter === "rent"
          ? o.service_origin_id === null
          : o.service_origin_id !== null)) &&
      (!currencyFilter || o.currency === currencyFilter) &&
      (!fromFilter || o.effective_period_end >= fromFilter) &&
      (!toFilter || o.period_start <= toFilter),
  );
  function obligationRows(debts = false) {
    return (
      <RecordCollection
        id={`${criteria}:${tab}`}
        label={debts ? "deudas" : "importes por cobrar"}
        items={obligations.filter((o) => !debts || exactCents(o.pending) > 0n)}
        searchable={(o) =>
          `${o.id} ${o.concept} ${name(o.person_id)} ${unit(o.unit_id)} contrato ${o.contract_id} ${financeStates[o.state]} ${o.effective_due_on} ${money(o.pending, o.currency)}`
        }
        filter={{
          label: "Estado del importe",
          value: (o) => financeStates[o.state] || o.state,
        }}
        empty="No hay importes por cobrar para esta selección."
        render={(o) => (
          <RecordRow
            key={o.id}
            title={o.concept}
            fields={
              <>
                <RecordField label="Titular">{name(o.person_id)}</RecordField>
                <RecordField label="Espacio">{unit(o.unit_id)}</RecordField>
                <RecordField label="Vencimiento">
                  {showDate(o.effective_due_on)}
                </RecordField>
                <RecordField label="Total exigible">
                  {money(o.total, o.currency)}
                </RecordField>
                {exactCents(o.applied) > 0n && (
                  <RecordField label="Pagos y saldos aplicados">
                    {money(o.applied, o.currency)}
                  </RecordField>
                )}
                <RecordField label="Deuda pendiente">
                  <strong>{money(o.pending, o.currency)}</strong>
                </RecordField>
                <RecordField label="Estado">
                  <RecordStatus domain="finance" state={o.state} />
                </RecordField>
              </>
            }
            actions={
              <>
                {canWrite && exactCents(o.pending) > 0n && (
                  <button onClick={() => open("receive", o.id)}>
                    Registrar cobro
                  </button>
                )}
              </>
            }
            detail={
              <>
                <dl className="record-row-fields">
                  <RecordField label="Contrato">{o.contract_id}</RecordField>
                  <RecordField label="Periodo">
                    {showDate(o.period_start)} al{" "}
                    {showDate(o.effective_period_end)}
                  </RecordField>
                  <RecordField label="Importe original">
                    {money(o.original_amount, o.currency)}
                  </RecordField>
                  <RecordField label="Ajustes">
                    {money(o.adjustments, o.currency)}
                  </RecordField>
                  <RecordField label="Saldo aplicado posteriormente">
                    {money(o.credit_applied, o.currency)}
                  </RecordField>
                </dl>
                {admin && (
                  <button
                    className="secondary"
                    onClick={() => open("adjust", o.id)}
                  >
                    Ajustar importe {o.id}
                  </button>
                )}
              </>
            }
          />
        )}
      />
    );
  }

  function movementRows(kinds: string[]) {
    return (
      <RecordCollection
        id={`${criteria}:${tab}`}
        label="movimientos"
        items={data.movements.filter(
          (m) =>
            kinds.includes(m.kind) &&
            (!personFilter || m.person_id === personFilter),
        )}
        searchable={(m) =>
          `${m.id} ${movementNames[m.kind]} ${name(m.person_id)} ${name(m.payer_id)} ${m.beneficiary_label || name(m.beneficiary_person_id)} ${m.occurred_on} ${m.reference ?? ""} ${m.document_reference ?? ""} ${money(m.amount, m.currency)} ${financeStates[m.state]}`
        }
        filter={{
          label: "Estado del movimiento",
          value: (m) => financeStates[m.state] || m.state,
        }}
        empty="No hay movimientos registrados en esta sección."
        render={(m) => {
          const holdsBalance = [
            "received",
            "advance",
            "guarantee",
            "provider_direct",
          ].includes(m.kind);
          const canApply =
            !m.void_operation_id &&
            canWrite &&
            ["received", "advance", "guarantee"].includes(m.kind) &&
            exactCents(m.available) > 0n;
          return (
            <RecordRow
              key={m.id}
              title={`${movementNames[m.kind]} · ${money(m.amount, m.currency)}`}
              fields={
                <>
                  <RecordField label="Titular">{name(m.person_id)}</RecordField>
                  <RecordField label="Fecha">
                    {showDate(m.occurred_on)}
                  </RecordField>
                  {holdsBalance && (
                    <RecordField
                      label={
                        m.kind === "provider_direct"
                          ? "Devolución externa pendiente"
                          : "Disponible"
                      }
                    >
                      {money(m.available, m.currency)}
                    </RecordField>
                  )}
                  <RecordField label="Estado">
                    <RecordStatus domain="movement" state={m.state} />
                  </RecordField>
                </>
              }
              actions={
                canApply &&
                (m.kind !== "guarantee" || admin) && (
                  <button onClick={() => open("apply", m.id)}>
                    Aplicar saldo {m.id}
                  </button>
                )
              }
              detailLabel={`Ver aplicaciones e historial del movimiento ${m.id}`}
              detail={
                <>
                  <dl className="record-row-fields">
                    <RecordField label="Entregó o pagó">
                      {name(m.payer_id)}
                    </RecordField>
                    <RecordField label="Recibió">
                      {m.beneficiary_label || name(m.beneficiary_person_id)}
                    </RecordField>
                    <RecordField label="Método">
                      {catalogs.methods.find((x) => x.id === m.method_id)
                        ?.name || "Registrado"}
                    </RecordField>
                    <RecordField label="Referencia">
                      {m.reference || "Sin referencia externa"}
                    </RecordField>
                    {m.document_reference && (
                      <RecordField label="Comprobante externo">
                        {m.document_reference}
                      </RecordField>
                    )}
                    {holdsBalance && (
                      <RecordField label="Aplicado">
                        {money(m.applied, m.currency)}
                      </RecordField>
                    )}
                  </dl>
                  {m.conditions && <p>Condiciones: {m.conditions}</p>}
                  {canApply && admin && (
                    <button
                      className="secondary"
                      onClick={() => open("refund", m.id)}
                    >
                      Registrar devolución {m.id}
                    </button>
                  )}
                  {canApply && m.kind === "guarantee" && admin && (
                    <button
                      className="secondary"
                      onClick={() => open("retain", m.id)}
                    >
                      Retener garantía {m.id}
                    </button>
                  )}
                  {!m.void_operation_id && admin && (
                    <button
                      className="secondary"
                      onClick={() => open("void", m.id)}
                    >
                      Anular para corregir {m.id}
                    </button>
                  )}
                  <RecordCollection
                    id={`${criteria}:${tab}:applications:${m.id}`}
                    label="aplicaciones"
                    items={m.applications}
                    searchable={(a) =>
                      `${a.obligation_id} ${money(a.amount, m.currency)} ${a.void_operation_id ? "Anulada" : "Vigente"}`
                    }
                    filter={{
                      label: "Estado de aplicación",
                      value: (a) =>
                        a.void_operation_id ? "Anulada" : "Vigente",
                    }}
                    empty="Sin aplicaciones a obligaciones."
                    render={(a) => (
                      <RecordRow
                        key={a.id}
                        title={`Concepto ${a.obligation_id} · ${money(a.amount, m.currency)}`}
                        fields={
                          <RecordField label="Estado">
                            <StatusIndicator
                              tone={a.void_operation_id ? "gray" : "blue"}
                              label={
                                a.void_operation_id
                                  ? "Aplicación anulada"
                                  : "Aplicación vigente"
                              }
                            />
                          </RecordField>
                        }
                        actions={
                          admin &&
                          !a.void_operation_id &&
                          !m.void_operation_id && (
                            <button
                              className="secondary"
                              onClick={() => open("applicationVoid", a.id)}
                            >
                              Corregir aplicación {a.id}
                            </button>
                          )
                        }
                      />
                    )}
                  />
                </>
              }
            />
          );
        }}
      />
    );
  }

  function expenseSearch(e: Expense) {
    return `${e.id} ${e.description} ${name(e.person_id)} ${unit(e.unit_id)} ${e.recorded_on} ${financeStates[e.state]} ${money(e.pending, e.currency)} ${catalogs.categories.find((c) => c.id === e.category_id)?.name ?? ""}`;
  }

  function expenseRows() {
    return (
      <RecordCollection
        id={`${criteria}:expenses`}
        label="gastos"
        items={data.expenses}
        searchable={expenseSearch}
        filter={{
          label: "Estado del gasto",
          value: (e) => financeStates[e.state] || e.state,
        }}
        empty="No hay gastos registrados."
        render={(e) => (
          <RecordRow
            key={e.id}
            title={e.description}
            fields={
              <>
                <RecordField label="Titular">{name(e.person_id)}</RecordField>
                <RecordField label="Fecha">
                  {showDate(e.recorded_on)}
                </RecordField>
                <RecordField label="Total registrado">
                  {money(e.total, e.currency)}
                </RecordField>
                <RecordField label="Pagado realmente">
                  {money(e.paid, e.currency)}
                </RecordField>
                <RecordField label="Por pagar">
                  <strong>{money(e.pending, e.currency)}</strong>
                </RecordField>
                <RecordField label="Estado">
                  <RecordStatus domain="finance" state={e.state} />
                </RecordField>
                {exactCents(e.provider_refund_pending) > 0n && (
                  <RecordField label="Devolución pendiente del proveedor">
                    {money(e.provider_refund_pending, e.currency)}
                  </RecordField>
                )}
              </>
            }
            actions={
              !e.void_operation_id &&
              canWrite &&
              exactCents(e.pending) > 0n && (
                <button onClick={() => open("pay", e.id)}>
                  Registrar pago del gasto {e.id}
                </button>
              )
            }
            detail={
              <>
                <dl className="record-row-fields">
                  <RecordField label="Espacio">{unit(e.unit_id)}</RecordField>
                  <RecordField label="Original">
                    {money(e.original_amount, e.currency)}
                  </RecordField>
                </dl>
                {!e.void_operation_id && admin && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => open("expenseAdjust", e.id)}
                    >
                      Ajustar gasto {e.id}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("expenseVoid", e.id)}
                    >
                      Anular gasto {e.id}
                    </button>
                  </>
                )}
              </>
            }
          />
        )}
      />
    );
  }
  return (
    <section>
      <p className="eyebrow">DINERO, IMPORTES Y RESPONSABILIDADES</p>
      <h1>Pagos y gastos</h1>
      <p>
        Consulta por separado lo que corresponde cobrar, el dinero recibido y
        los pagos realizados.
      </p>
      <PropertySelect
        label="Casa de los pagos y gastos"
        properties={properties}
        disabled={!!action}
        value={propertyId || ""}
        onChange={(id) => {
          setPropertyId(Number(id));
          saveProperty(Number(id));
          if (initialObligationId) setObligationFilter(0);
          onPropertyChange?.(Number(id));
        }}
      />
      <nav
        className="utility-tabs finance-tabs"
        aria-label="Secciones económicas"
      >
        {tabs
          .filter(
            ([id]) =>
              !section ||
              (section === "debts"
                ? ["debts", "history", "summary"].includes(id)
                : section === "expenses"
                  ? ["expenses", "disbursements", "summary"].includes(id)
                  : !["debts", "expenses", "disbursements"].includes(id)),
          )
          .map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "" : "secondary"}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                if (
                  !confirmFormDiscard(
                    activeForm.current?.querySelector("form") ?? null,
                  )
                )
                  return;
                setTab(id);
                setAction(
                  id === "receive" && canWrite ? { kind: "receive" } : null,
                );
                setNotice("");
              }}
            >
              {label}
            </button>
          ))}
      </nav>
      <ErrorMessage message={error || related.error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!propertyId ? (
        <p>Selecciona una casa autorizada.</p>
      ) : busy && !data.summary.length ? (
        <p role="status">Cargando movimientos…</p>
      ) : action?.kind === "catalog" ? (
        <CatalogForm
          catalogs={catalogs}
          onSaved={load}
          onCancel={() => setAction(null)}
        />
      ) : action ? (
        <div ref={activeForm}>
          <FinanceForm
            key={`${propertyId}-${action.kind}-${action.id || 0}`}
            base={base}
            action={action}
            data={data}
            catalogs={catalogs}
            people={related.candidates}
            units={related.units}
            contracts={contracts.filter(
              (contract) => contract.resolved_property_id === propertyId,
            )}
            receipts={receipts}
            propertyId={propertyId}
            onContactAdded={() => void related.reload()}
            admin={admin}
            initialPersonId={
              data.obligations.find(
                (obligation) =>
                  action.kind === "receive" && obligation.id === action.id,
              )?.person_id ?? personFilter
            }
            onSaved={saved}
            onCancel={() => setAction(null)}
          />
        </div>
      ) : (
        <>
          {[
            "receivable",
            "debts",
            "history",
            "advances",
            "guarantees",
            "disbursements",
          ].includes(tab) && (
            <SearchSelect
              label="Filtrar por persona"
              value={personFilter || ""}
              options={related.candidates.map(personOption)}
              onChange={(id) => setPersonFilter(Number(id))}
            />
          )}
          {tab === "summary" && (
            <>
              <h2>Resumen económico</h2>
              {onReminders && (
                <button
                  className="secondary"
                  onClick={() => onReminders(propertyId)}
                >
                  Ver recordatorios y pagos reportados de esta casa
                </button>
              )}
              {onCapital && (
                <button
                  className="secondary"
                  onClick={() => onCapital(propertyId)}
                >
                  Ver anticréticos y capital de esta casa
                </button>
              )}
              <p>
                Cada moneda se muestra por separado. Los importes por cobrar y
                los gastos registrados no prueban que se haya recibido o pagado
                dinero.
              </p>
              <RecordCollection
                id={`${criteria}:balances`}
                label="saldos por moneda"
                items={data.summary}
                searchable={(s) => s.currency}
                empty="No hay operaciones económicas en esta casa."
                render={(s) => (
                  <RecordRow
                    key={s.currency}
                    title={`Moneda ${s.currency}`}
                    fields={
                      <>
                        <RecordField label={summaryLabels.pending}>
                          {money(s.pending || "0", s.currency)}
                        </RecordField>
                        <RecordField label={summaryLabels.received}>
                          {money(s.received || "0", s.currency)}
                        </RecordField>
                        <RecordField label={summaryLabels.expenses_registered}>
                          {money(s.expenses_registered || "0", s.currency)}
                        </RecordField>
                        <RecordField label={summaryLabels.disbursed}>
                          {money(s.disbursed || "0", s.currency)}
                        </RecordField>
                      </>
                    }
                    detail={
                      <dl className="record-row-fields">
                        {Object.entries(summaryLabels)
                          .filter(
                            ([key]) =>
                              ![
                                "pending",
                                "received",
                                "expenses_registered",
                                "disbursed",
                              ].includes(key),
                          )
                          .map(([key, label]) => (
                            <RecordField key={key} label={label}>
                              {money(s[key] || "0", s.currency)}
                            </RecordField>
                          ))}
                      </dl>
                    }
                    detailLabel="Ver desglose de la moneda"
                  />
                )}
              />
              {user.role === "general_admin" && (
                <button className="secondary" onClick={() => open("catalog")}>
                  Métodos y categorías
                </button>
              )}
              <details>
                <summary>Historial de registros, ajustes y anulaciones</summary>
                <RecordCollection
                  id={`${criteria}:audit`}
                  label="operaciones del historial"
                  items={data.history.map((h) => {
                    const labels: Record<string, string> = {
                      receive: "Pago recibido",
                      guarantee: "Garantía recibida",
                      expense: "Gasto registrado",
                      disburse: "Pago realizado",
                      refund: "Devolución",
                      void: "Anulación de movimiento",
                      apply: "Aplicación de saldo",
                      rent: "Importes de alquiler",
                      utility: "Reparto de servicio importado",
                      adjust: "Ajuste por cobrar",
                      "expense-adjust": "Ajuste de gasto",
                      "expense-void": "Anulación de gasto",
                      "application-void": "Corrección de aplicación",
                      retain: "Garantía retenida",
                    };
                    const result = JSON.parse(h.result);
                    return {
                      ...h,
                      reason: result.reason as string | undefined,
                      label:
                        labels[h.action.split(":")[0]] ||
                        "Operación registrada",
                    };
                  })}
                  searchable={(h) =>
                    `${h.label} ${h.created_at} usuario ${h.created_by} ${h.reason ?? ""}`
                  }
                  filter={{ label: "Tipo de operación", value: (h) => h.label }}
                  render={(h) => (
                    <RecordRow
                      key={h.id}
                      title={h.label}
                      fields={
                        <>
                          <RecordField label="Fecha">
                            {new Date(h.created_at + "Z").toLocaleString(
                              "es-BO",
                            )}
                          </RecordField>
                          <RecordField label="Usuario">
                            {h.created_by}
                          </RecordField>
                        </>
                      }
                      detail={h.reason && <p>{h.reason}</p>}
                      detailLabel="Ver motivo"
                    />
                  )}
                />
              </details>
            </>
          )}
          {(tab === "receivable" || tab === "debts") && (
            <>
              <h2>
                {tab === "debts" ? "Deudas pendientes" : "Importes por cobrar"}
              </h2>
              <SearchSelect
                label="Buscar importe por cobrar"
                value={obligationFilter || ""}
                options={data.obligations.map((obligation) => ({
                  value: obligation.id,
                  label: `${obligation.concept} · ${name(obligation.person_id)} · ${unit(obligation.unit_id)} · ${money(obligation.pending, obligation.currency)} · ${showDate(obligation.period_start)}`,
                }))}
                onChange={(id) => setObligationFilter(Number(id))}
              />
              <details>
                <summary>
                  Filtrar por cuarto, contrato, periodo, concepto y moneda
                </summary>
                <div className="form-grid">
                  <SearchSelect
                    label="Filtrar por cuarto"
                    value={unitFilter}
                    onChange={setUnitFilter}
                    options={[
                      { value: "whole", label: "Casa completa" },
                      ...related.units.map(unitOption),
                    ]}
                  />
                  <SearchSelect
                    label="Filtrar por contrato"
                    value={contractFilter || ""}
                    onChange={(id) => setContractFilter(Number(id))}
                    options={contracts
                      .filter(
                        (contract) =>
                          contract.resolved_property_id === propertyId,
                      )
                      .map((contract) => ({
                        value: contract.id,
                        label: `${contract.target_label} · ${name(contract.responsible_person_id)} · ${showDate(contract.start_date)}`,
                      }))}
                  />
                  <Field label="Filtrar por concepto">
                    <select
                      value={conceptFilter}
                      onChange={(e) => setConceptFilter(e.target.value)}
                    >
                      <option value="">Todos los conceptos</option>
                      <option value="rent">Alquiler</option>
                      <option value="service">Servicios básicos</option>
                    </select>
                  </Field>
                  <Field label="Filtrar por moneda">
                    <select
                      value={currencyFilter}
                      onChange={(e) => setCurrencyFilter(e.target.value)}
                    >
                      <option value="">Todas, mostradas por separado</option>
                      {Array.from(
                        new Set(data.obligations.map((o) => o.currency)),
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Periodo desde">
                    <input
                      type="date"
                      value={fromFilter}
                      onChange={(e) => setFromFilter(e.target.value)}
                    />
                  </Field>
                  <Field label="Periodo hasta">
                    <input
                      type="date"
                      value={toFilter}
                      onChange={(e) => setToFilter(e.target.value)}
                    />
                  </Field>
                </div>
              </details>
              {canWrite && (
                <div className="form-actions">
                  <button onClick={() => open("rent")}>
                    Generar alquileres
                  </button>
                  <button className="secondary" onClick={() => open("utility")}>
                    Importar servicios confirmados
                  </button>
                </div>
              )}
              {obligationRows(tab === "debts")}
            </>
          )}
          {tab === "receive" && (
            <>
              {canWrite ? (
                <button onClick={() => open("receive")}>
                  Registrar pago recibido
                </button>
              ) : (
                <p>Este perfil permite consultar los pagos registrados.</p>
              )}
            </>
          )}
          {tab === "history" && (
            <>
              <h2>Historial de pagos recibidos</h2>
              {canWrite && (
                <button onClick={() => open("receive")}>
                  Registrar pago recibido
                </button>
              )}
              {movementRows(["received", "advance", "refund"])}
            </>
          )}
          {tab === "advances" && (
            <>
              <h2>Anticipos y saldos a favor</h2>
              <p>
                El dinero sin aplicar conserva su titular, casa, moneda y
                movimiento original.
              </p>
              {canWrite && (
                <button onClick={() => open("receive")}>
                  Registrar anticipo
                </button>
              )}
              {movementRows(["advance", "received"])}
            </>
          )}
          {tab === "guarantees" && (
            <>
              <h2>Garantías de alquiler</h2>
              <p>
                Estos importes se conservan separados del ingreso ordinario. No
                son capital de anticrético.
              </p>
              {canWrite && (
                <button onClick={() => open("guarantee")}>
                  Registrar garantía
                </button>
              )}
              {movementRows(["guarantee"])}
            </>
          )}
          {tab === "expenses" && (
            <>
              <h2>Gastos de la casa</h2>
              {canWrite && (
                <button onClick={() => open("expense")}>Registrar gasto</button>
              )}
              {expenseRows()}
            </>
          )}
          {tab === "disbursements" && (
            <>
              <h2>Pagos realizados y devoluciones</h2>
              {movementRows(["disbursed", "provider_direct", "refund"])}
            </>
          )}
          {tab === "services" && (
            <>
              <h2>Recuperación de servicios</h2>
              {canWrite && (
                <div className="form-actions">
                  <button onClick={() => open("utility")}>
                    Importar reparto confirmado
                  </button>
                  <button
                    className="secondary"
                    onClick={() => open("provider")}
                  >
                    Registrar gasto de recibo externo
                  </button>
                </div>
              )}
              <RecordCollection
                id={`${criteria}:recovery`}
                label="recuperaciones de servicios"
                items={data.expenses.filter((e) => e.receipt_id)}
                searchable={expenseSearch}
                filter={{
                  label: "Estado del gasto de servicio",
                  value: (e) => financeStates[e.state] || e.state,
                }}
                render={(e) => {
                  const obligations = data.obligations.filter(
                    (o) => o.receipt_id === e.receipt_id,
                  );
                  const applied = obligations.reduce(
                    (total, o) => total + exactCents(o.applied),
                    0n,
                  );
                  const total = obligations.reduce(
                    (total, o) => total + exactCents(o.total),
                    0n,
                  );
                  return (
                    <RecordRow
                      key={e.id}
                      title={e.description}
                      fields={
                        <>
                          <RecordField label="Recibo registrado">
                            {money(e.total, e.currency)}
                          </RecordField>
                          <RecordField label="Pagado al proveedor">
                            {money(e.paid, e.currency)}
                          </RecordField>
                          <RecordField label="Reparto">
                            <StatusIndicator
                              tone={
                                e.pending_distribution_change ||
                                !e.imported_distribution_id
                                  ? "amber"
                                  : "green"
                              }
                              label={
                                e.pending_distribution_change
                                  ? "Reparto actualizado pendiente de importar"
                                  : e.imported_distribution_id
                                    ? "Importado"
                                    : "Pendiente de confirmar o importar"
                              }
                            />
                          </RecordField>
                          <RecordField label="Estado del gasto">
                            <RecordStatus domain="finance" state={e.state} />
                          </RecordField>
                        </>
                      }
                      actions={
                        canWrite &&
                        exactCents(e.pending) > 0n && (
                          <button onClick={() => open("pay", e.id)}>
                            Registrar pago al proveedor {e.id}
                          </button>
                        )
                      }
                      detail={
                        <>
                          <dl className="record-row-fields">
                            {e.imported_distribution_id && (
                              <RecordField label="Parte económica del propietario">
                                {money(
                                  e.owner_service_amount || "0",
                                  e.currency,
                                )}
                              </RecordField>
                            )}
                            <RecordField label="Por cobrar a ocupantes">
                              {money(exactAmount(total), e.currency)}
                            </RecordField>
                            <RecordField label="Cubierto por pagos o saldos">
                              {money(exactAmount(applied), e.currency)}
                            </RecordField>
                          </dl>
                          <RecordCollection
                            id={`${criteria}:recovery:${e.id}:debts`}
                            label="responsabilidades de ocupantes"
                            items={obligations}
                            searchable={(o) =>
                              `${name(o.person_id)} ${unit(o.unit_id)} ${financeStates[o.state]}`
                            }
                            filter={{
                              label: "Estado de la obligación",
                              value: (o) => financeStates[o.state] || o.state,
                            }}
                            render={(o) => (
                              <RecordRow
                                key={o.id}
                                title={name(o.person_id)}
                                fields={
                                  <>
                                    <RecordField label="Espacio">
                                      {unit(o.unit_id)}
                                    </RecordField>
                                    <RecordField label="Pendiente">
                                      {money(o.pending, o.currency)}
                                    </RecordField>
                                    <RecordField label="Estado">
                                      <RecordStatus
                                        domain="finance"
                                        state={o.state}
                                      />
                                    </RecordField>
                                  </>
                                }
                              />
                            )}
                          />
                        </>
                      }
                    />
                  );
                }}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

function CatalogForm({
  catalogs,
  onSaved,
  onCancel,
}: {
  catalogs: FinanceCatalogs;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function toggle(kind: string, c: Catalog) {
    setBusy(true);
    setError("");
    try {
      await api(`/finances/catalogs/${kind}/${c.id}`, "PATCH", {
        name: c.name,
        is_active: !c.is_active,
      });
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api(`/finances/catalogs/${v.get("kind")}`, "POST", {
        name: String(v.get("name")),
      });
      await onSaved();
      form.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Métodos de pago y categorías de gastos</h2>
      <ErrorMessage message={error} />
      <form onSubmit={submit}>
        <Field label="Tipo de registro">
          <select name="kind">
            <option value="methods">Método de pago</option>
            <option value="categories">Categoría de gasto</option>
          </select>
        </Field>
        <Field label="Nombre">
          <input name="name" minLength={2} maxLength={80} required />
        </Field>
        <button disabled={busy}>Registrar nombre</button>
      </form>
      {(["methods", "categories"] as const).map((kind) => (
        <section key={kind}>
          <h3>
            {kind === "methods" ? "Métodos de pago" : "Categorías de gasto"}
          </h3>
          <RecordCollection
            id={`finance-catalog:${kind}`}
            label={
              kind === "methods" ? "métodos de pago" : "categorías de gasto"
            }
            items={catalogs[kind]}
            searchable={(c) => c.name}
            filter={{
              label: "Estado del catálogo",
              value: (c) => (c.is_active ? "Habilitado" : "Deshabilitado"),
            }}
            render={(c) => (
              <RecordRow
                key={c.id}
                title={c.name}
                fields={
                  <RecordField label="Estado">
                    <StatusIndicator
                      tone={c.is_active ? "blue" : "gray"}
                      label={c.is_active ? "Habilitado" : "Deshabilitado"}
                    />
                  </RecordField>
                }
                actions={
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void toggle(kind, c)}
                  >
                    {c.is_active ? "Deshabilitar" : "Habilitar"} {c.name}
                  </button>
                }
              />
            )}
          />
        </section>
      ))}
      <button className="secondary" onClick={onCancel}>
        Volver al resumen
      </button>
    </section>
  );
}

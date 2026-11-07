import { useEffect, useRef, useState } from "react";
import { api } from "../api";
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
import type { FinanceData, FinanceCatalogs, Catalog } from "../finances";

const tabs = [
  ["summary", "Resumen económico"],
  ["receivable", "Por cobrar"],
  ["receive", "Registrar pago"],
  ["debts", "Deudas"],
  ["history", "Historial de pagos"],
  ["advances", "Anticipos"],
  ["guarantees", "Garantías"],
  ["expenses", "Gastos"],
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
}: {
  user: User;
  properties: Property[];
  people: Person[];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 0),
    [tab, setTab] = useState("summary"),
    [data, setData] = useState<FinanceData>(empty),
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
    [personFilter, setPersonFilter] = useState(0),
    [unitFilter, setUnitFilter] = useState(""),
    [contractFilter, setContractFilter] = useState(0),
    [conceptFilter, setConceptFilter] = useState(""),
    [currencyFilter, setCurrencyFilter] = useState(""),
    [fromFilter, setFromFilter] = useState(""),
    [toFilter, setToFilter] = useState("");
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
    setPersonFilter(0);
    setUnitFilter("");
    setContractFilter(0);
    setConceptFilter("");
    setCurrencyFilter("");
    setFromFilter("");
    setToFilter("");
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
  function obligationCards(debts = false) {
    return (
      <div className="record-list">
        {obligations
          .filter((o) => !debts || exactCents(o.pending) > 0n)
          .map((o) => (
            <article className="panel history-item" key={o.id}>
              <h3>
                {o.concept} · {name(o.person_id)}
              </h3>
              <p>
                {unit(o.unit_id)} · Contrato {o.contract_id} ·{" "}
                {showDate(o.period_start)} al {showDate(o.effective_period_end)}
              </p>
              <p>
                <strong>{financeStates[o.state] || o.state}</strong> · vence{" "}
                {showDate(o.effective_due_on)}
              </p>
              <dl className="finance-values">
                <div>
                  <dt>Importe original</dt>
                  <dd>{money(o.original_amount, o.currency)}</dd>
                </div>
                <div>
                  <dt>Ajustes</dt>
                  <dd>{money(o.adjustments, o.currency)}</dd>
                </div>
                <div>
                  <dt>Total exigible</dt>
                  <dd>{money(o.total, o.currency)}</dd>
                </div>
                <div>
                  <dt>Pagos y saldos aplicados</dt>
                  <dd>{money(o.applied, o.currency)}</dd>
                </div>
                <div>
                  <dt>Saldo aplicado posteriormente</dt>
                  <dd>{money(o.credit_applied, o.currency)}</dd>
                </div>
                <div>
                  <dt>Deuda pendiente</dt>
                  <dd>
                    <strong>{money(o.pending, o.currency)}</strong>
                  </dd>
                </div>
              </dl>
              {canWrite && exactCents(o.pending) > 0n && (
                <button
                  onClick={() => {
                    setPersonFilter(o.person_id);
                    open("receive");
                  }}
                >
                  Registrar pago para esta persona
                </button>
              )}
              {admin && (
                <button
                  className="secondary"
                  onClick={() => open("adjust", o.id)}
                >
                  Ajustar importe {o.id}
                </button>
              )}
            </article>
          ))}
        {!obligations.length && (
          <p>No hay importes por cobrar para esta selección.</p>
        )}
      </div>
    );
  }
  function movementCards(kind: string[]) {
    const list = data.movements.filter(
      (m) =>
        kind.includes(m.kind) &&
        (!personFilter || m.person_id === personFilter),
    );
    return (
      <div className="record-list">
        {list.map((m) => (
          <article className="panel history-item" key={m.id}>
            <h3>
              {movementNames[m.kind]} · {money(m.amount, m.currency)}
            </h3>
            <p>
              {financeStates[m.state] || m.state} · {showDate(m.occurred_on)} ·
              Titular: {name(m.person_id)}
            </p>
            <p>
              Entregó/pagó: {name(m.payer_id)} · Recibió:{" "}
              {m.beneficiary_label || name(m.beneficiary_person_id)}
            </p>
            <p>
              Método:{" "}
              {catalogs.methods.find((x) => x.id === m.method_id)?.name ||
                "Registrado"}{" "}
              · Referencia: {m.reference || "Sin referencia externa"}
            </p>
            {m.document_reference && (
              <p>Comprobante externo: {m.document_reference}</p>
            )}
            {["received", "advance", "guarantee", "provider_direct"].includes(
              m.kind,
            ) && (
              <p>
                Aplicado: {money(m.applied, m.currency)} · {m.kind==='provider_direct'?'Pendiente de devolución externa':'Disponible'}:{" "}
                <strong>{money(m.available, m.currency)}</strong>
              </p>
            )}
            {m.conditions && <p>Condiciones: {m.conditions}</p>}
            {!m.void_operation_id &&
              canWrite &&
              ["received", "advance", "guarantee"].includes(m.kind) &&
              exactCents(m.available) > 0n && (
                <div className="form-actions">
                  {(m.kind !== "guarantee" || admin) && (
                    <button onClick={() => open("apply", m.id)}>
                      Aplicar saldo {m.id}
                    </button>
                  )}
                  {admin && (
                    <button
                      className="secondary"
                      onClick={() => open("refund", m.id)}
                    >
                      Registrar devolución {m.id}
                    </button>
                  )}
                  {m.kind === "guarantee" && admin && (
                    <button
                      className="secondary"
                      onClick={() => open("retain", m.id)}
                    >
                      Retener garantía {m.id}
                    </button>
                  )}
                </div>
              )}
            {!m.void_operation_id && admin && (
              <button className="secondary" onClick={() => open("void", m.id)}>
                Anular para corregir {m.id}
              </button>
            )}
            <details>
              <summary>
                Ver aplicaciones e historial del movimiento {m.id}
              </summary>
              {m.applications.map((a) => (
                <p key={a.id}>
                  Concepto {a.obligation_id}: {money(a.amount, m.currency)} ·{" "}
                  {a.void_operation_id
                    ? "Aplicación anulada"
                    : "Aplicación vigente"}
                  {admin && !a.void_operation_id && !m.void_operation_id && (
                    <button
                      className="text-button"
                      onClick={() => open("applicationVoid", a.id)}
                    >
                      Corregir aplicación {a.id}
                    </button>
                  )}
                </p>
              ))}
              {!m.applications.length && (
                <p>Sin aplicaciones a obligaciones.</p>
              )}
            </details>
          </article>
        ))}
        {!list.length && <p>No hay movimientos registrados en esta sección.</p>}
      </div>
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
      <Field label="Casa de los pagos y gastos">
        <select
          value={propertyId || ""}
          onChange={(e) => setPropertyId(Number(e.target.value))}
        >
          <option value="">Seleccionar casa</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <nav
        className="utility-tabs finance-tabs"
        aria-label="Secciones económicas"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "" : "secondary"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
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
        <FinanceForm
          key={`${propertyId}-${action.kind}-${action.id || 0}`}
          base={base}
          action={action}
          data={data}
          catalogs={catalogs}
          people={related.candidates}
          units={related.units}
          contracts={contracts}
          receipts={receipts}
          admin={admin}
          initialPersonId={personFilter}
          onSaved={saved}
          onCancel={() => setAction(null)}
        />
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
            <Field label="Filtrar por persona">
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(Number(e.target.value))}
              >
                <option value={0}>Todas las personas de la casa</option>
                {related.candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {tab === "summary" && (
            <>
              <h2>Resumen económico</h2>
              <p>
                Cada moneda se muestra por separado. Los importes por cobrar y
                los gastos registrados no prueban que se haya recibido o pagado
                dinero.
              </p>
              {data.summary.map((s) => (
                <section key={s.currency} className="panel">
                  <h3>Moneda {s.currency}</h3>
                  <dl className="finance-values">
                    {Object.entries(summaryLabels).map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{money(s[key] || "0", s.currency)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {!data.summary.length && (
                <p>No hay operaciones económicas en esta casa.</p>
              )}
              {user.role === "general_admin" && (
                <button className="secondary" onClick={() => open("catalog")}>
                  Métodos y categorías
                </button>
              )}
              <details>
                <summary>Historial de registros, ajustes y anulaciones</summary>
                {data.history.map((h) => {
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
                  return (
                    <p key={h.id}>
                      {labels[h.action.split(":")[0]] || "Operación registrada"}{" "}
                      · {new Date(h.created_at + "Z").toLocaleString("es-BO")} ·
                      Usuario {h.created_by}
                      {result.reason ? ` · Motivo: ${result.reason}` : ""}
                    </p>
                  );
                })}
              </details>
            </>
          )}
          {(tab === "receivable" || tab === "debts") && (
            <>
              <h2>
                {tab === "debts" ? "Deudas pendientes" : "Importes por cobrar"}
              </h2>
              <details>
                <summary>
                  Filtrar por cuarto, contrato, periodo, concepto y moneda
                </summary>
                <div className="form-grid">
                  <Field label="Filtrar por cuarto">
                    <select
                      value={unitFilter}
                      onChange={(e) => setUnitFilter(e.target.value)}
                    >
                      <option value="">Todos los espacios</option>
                      <option value="whole">Casa completa</option>
                      {related.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} · {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Filtrar por contrato">
                    <select
                      value={contractFilter}
                      onChange={(e) =>
                        setContractFilter(Number(e.target.value))
                      }
                    >
                      <option value={0}>Todos los contratos</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          Contrato {c.id} · {c.target_label}
                        </option>
                      ))}
                    </select>
                  </Field>
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
              {obligationCards(tab === "debts")}
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
              {movementCards(["received", "advance", "refund"])}
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
              {movementCards(["advance", "received"])}
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
              {movementCards(["guarantee"])}
            </>
          )}
          {tab === "expenses" && (
            <>
              <h2>Gastos de la casa</h2>
              {canWrite && (
                <button onClick={() => open("expense")}>Registrar gasto</button>
              )}
              {data.expenses.map((e) => (
                <article className="panel" key={e.id}>
                  <h3>{e.description}</h3>
                  <p>
                    {name(e.person_id)} · {unit(e.unit_id)} ·{" "}
                    {showDate(e.recorded_on)} · {financeStates[e.state]}
                  </p>
                  <p>
                    Original {money(e.original_amount, e.currency)} · Total
                    registrado {money(e.total, e.currency)} · Pagado realmente{" "}
                    {money(e.paid, e.currency)} · Por pagar{" "}
                    <strong>{money(e.pending, e.currency)}</strong>
                  </p>
                  {exactCents(e.provider_refund_pending) > 0n && (
                    <p>
                      Devolución pendiente del proveedor:{" "}
                      {money(e.provider_refund_pending, e.currency)}. No se ha
                      registrado dinero devuelto.
                    </p>
                  )}
                  {!e.void_operation_id && (
                    <div className="form-actions">
                      {canWrite && exactCents(e.pending) > 0n && (
                        <button onClick={() => open("pay", e.id)}>
                          Registrar pago del gasto {e.id}
                        </button>
                      )}
                      {admin && (
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
                    </div>
                  )}
                </article>
              ))}
              {!data.expenses.length && <p>No hay gastos registrados.</p>}
            </>
          )}
          {tab === "disbursements" && (
            <>
              <h2>Pagos realizados y devoluciones</h2>
              {movementCards(["disbursed", "provider_direct", "refund"])}
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
              {data.expenses
                .filter((e) => e.receipt_id)
                .map((e) => {
                  const obs = data.obligations.filter(
                    (o) => o.receipt_id === e.receipt_id,
                  );
                  const applied = obs.reduce(
                    (a, o) => a + exactCents(o.applied),
                    0n,
                  );
                  const total = obs.reduce(
                    (a, o) => a + exactCents(o.total),
                    0n,
                  );
                  return (
                    <article className="panel" key={e.id}>
                      <h3>{e.description}</h3>
                      <p>
                        Recibo registrado: {money(e.total, e.currency)} · Pagado
                        al proveedor: {money(e.paid, e.currency)}
                      </p>
                      {e.imported_distribution_id ? (
                        <p>
                          Parte económica del propietario:{" "}
                          {money(e.owner_service_amount || "0", e.currency)}
                        </p>
                      ) : (
                        <p>
                          Reparto económico pendiente de confirmar o importar.
                          No se generaron deudas de inquilinos en el registro
                          del gasto.
                        </p>
                      )}
                      {e.pending_distribution_change && (
                        <p role="alert">
                          Existe un reparto confirmado más reciente pendiente de
                          importar. Este resumen conserva la última importación
                          financiera.
                        </p>
                      )}
                      <p>
                        Responsabilidades por cobrar a ocupantes:{" "}
                        {money(exactAmount(total), e.currency)} · Cubierto por
                        pagos o saldos:{" "}
                        {money(exactAmount(applied), e.currency)}
                      </p>
                      <p>
                        Los pagos directos de inquilinos y las recuperaciones en
                        caja se distinguen en el resumen y el historial.
                      </p>
                      {obs.map((o) => (
                        <p key={o.id}>
                          {name(o.person_id)} · {unit(o.unit_id)}: pendiente{" "}
                          {money(o.pending, o.currency)}
                        </p>
                      ))}
                      {canWrite && exactCents(e.pending) > 0n && (
                        <button onClick={() => open("pay", e.id)}>
                          Registrar pago al proveedor {e.id}
                        </button>
                      )}
                    </article>
                  );
                })}
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
          {catalogs[kind].map((c) => (
            <p key={c.id}>
              {c.name} · {c.is_active ? "Habilitado" : "Deshabilitado"}{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void toggle(kind, c)}
              >
                {c.is_active ? "Deshabilitar" : "Habilitar"} {c.name}
              </button>
            </p>
          ))}
        </section>
      ))}
      <button className="secondary" onClick={onCancel}>
        Volver al resumen
      </button>
    </section>
  );
}

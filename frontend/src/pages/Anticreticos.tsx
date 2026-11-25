import {
  RecordCollection,
  RecordField,
  RecordRow,
  useListPreference,
} from "../components/RecordList";
import { RecordStatus, StatusIndicator } from "../components/StatusIndicator";
import { financeStates } from "../finances";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { PropertySelect } from "../components/PropertySelect";
import { SearchSelect } from "../components/SearchSelect";
import { Field, ErrorMessage, errorText } from "../components/Form";
import type { Person, Property, User } from "../types";
import type { FinanceCatalogs } from "../finances";
import type { CapitalBook, CapitalData, CapitalTarget } from "../anticreticos";
import {
  capitalStates,
  capitalLabels,
  capitalFields,
  adjustmentNames,
  money,
  exactCents,
} from "../anticreticos";
import { showDate, addDays } from "../tenancy";
import { usePropertyData } from "./tenancy/Shared";
import { ConditionsForm } from "./anticreticos/ConditionsForm";
import { CapitalForm } from "./anticreticos/CapitalForm";

const empty: CapitalData = { items: [], summary: [], today: "" };
type Action = {
  kind:
    | "conditions"
    | "delivery"
    | "return"
    | "adjustment"
    | "void"
    | "voidAdjustment"
    | "extend";
  id?: number;
};
export function Anticreticos({
  user,
  properties,
  people,
  initialTarget,
  onContracts,
  onFinances,
}: {
  user: User;
  properties: Property[];
  people: Person[];
  initialTarget?: CapitalTarget | null;
  onContracts?: () => void;
  onFinances?: (propertyId: number) => void;
}) {
  const [savedProperty, saveProperty] = useListPreference("capital:house", 0);
  const [propertyId, setPropertyId] = useState(
    initialTarget?.propertyId || savedProperty || properties[0]?.id || 0,
  );
  const criteria = `capital:${propertyId}`;
  const [selected, setSelected] = useState<number | null>(
      initialTarget?.contractId || null,
    ),
    [data, setData] = useState<CapitalData>(empty),
    [catalogs, setCatalogs] = useState<FinanceCatalogs>({
      methods: [],
      categories: [],
    }),
    [view, setView] = useListPreference(`${criteria}:view`, "list"),
    [detailTab, setDetailTab] = useState("capital"),
    [filter, setFilter] = useListPreference(
      `${criteria}:${view}:state`,
      view === "due" ? "upcoming" : "all",
    ),
    [contractFilter, setContractFilter] = useListPreference(
      `${criteria}:${view}:contract`,
      "",
    ),
    [horizon, setHorizon] = useListPreference(
      `${criteria}:${view}:horizon`,
      30,
    ),
    [action, setAction] = useState<Action | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const current = useRef(propertyId),
    sequence = useRef(0);
  current.current = propertyId;
  const related = usePropertyData(
    propertyId,
    people,
    user.role === "general_admin",
  );
  const admin = ["general_admin", "property_admin"].includes(user.role),
    canDeliver = user.role !== "owner";
  const name = (id: number | null | undefined) =>
    related.candidates.find((p) => p.id === id)?.full_name ||
    (id ? `Persona registrada n.º ${id}` : "Pendiente de seleccionar");
  async function load() {
    if (!propertyId || current.current !== propertyId) return false;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const [next, cat] = await Promise.all([
        api<CapitalData>(`/properties/${propertyId}/anticreticos`),
        api<FinanceCatalogs>("/finances/catalogs"),
      ]);
      if (request === sequence.current) {
        setData(next);
        setCatalogs(cat);
      }
      return request === sequence.current;
    } catch (e) {
      if (request === sequence.current) setError(errorText(e));
      return false;
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    setData(empty);
    setAction(null);
    setNotice("");
    void load();
    return () => {
      sequence.current++;
    };
  }, [propertyId]);
  const book = data.items.find((b) => b.contract.id === selected);
  async function saved() {
    const refreshed = await load();
    setAction(null);
    setNotice(
      refreshed
        ? "Registro guardado. El capital y el historial están actualizados."
        : "La operación se registró. Actualiza los datos para comprobar los saldos actuales.",
    );
  }
  function open(kind: Action["kind"], id?: number) {
    setNotice("");
    setAction({ kind, id });
  }
  const until = data.today ? addDays(data.today, horizon) : "";
  const matches = (b: CapitalBook) =>
    filter === "all" ||
    (filter === "preparation" &&
      (!b.conditions || b.review_issues.length > 0)) ||
    (filter === "overdue" && b.state === "overdue") ||
    (filter === "finished" &&
      ["finished", "cancelled"].includes(b.contract.status) &&
      exactCents(b.capital_pending) > 0n) ||
    (filter === "pending" && exactCents(b.capital_pending) > 0n) ||
    (filter === "returned" &&
      ["returned", "settled_by_agreement"].includes(b.state)) ||
    (filter === "upcoming" &&
      ((b.contract.status === "active" &&
        b.contract.end_date >= data.today &&
        b.contract.end_date <= until) ||
        !!(
          b.conditions?.restitution_on &&
          exactCents(b.capital_pending) > 0n &&
          b.conditions.restitution_on >= data.today &&
          b.conditions.restitution_on <= until
        )));
  function amounts(b: CapitalBook) {
    return (
      <dl className="finance-values">
        {capitalFields.map((key) => (
          <div key={key}>
            <dt>{capitalLabels[key]}</dt>
            <dd>{money(b[key], b.currency)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <section>
      <p className="eyebrow">ACUERDOS Y DINERO DE CAPITAL, POR SEPARADO</p>
      <h1>Anticréticos</h1>
      <p>
        Consulta capital recibido, devoluciones y responsabilidades sin
        mezclarlos con alquileres, garantías ni servicios.
      </p>
      <PropertySelect
        label="Casa de los anticréticos"
        properties={properties}
        value={propertyId || ""}
        disabled={!!action}
        onChange={(id) => {
          setSelected(null);
          setPropertyId(Number(id));
          saveProperty(Number(id));
        }}
      />
      <div className="form-actions">
        <button
          className="secondary"
          onClick={() => void load()}
          disabled={busy}
        >
          Actualizar datos
        </button>
        {onContracts && (
          <button className="secondary" onClick={onContracts}>
            Contratos y ocupación
          </button>
        )}
        {onFinances && (
          <button className="secondary" onClick={() => onFinances(propertyId)}>
            Pagos y servicios de esta casa
          </button>
        )}
      </div>
      <ErrorMessage message={error || related.error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!propertyId ? (
        <p>Selecciona una casa autorizada.</p>
      ) : busy && !data.items.length ? (
        <p role="status">Cargando anticréticos…</p>
      ) : book ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              setSelected(null);
              setAction(null);
            }}
          >
            ← Volver al listado de anticréticos
          </button>
          <h2>Anticrético · {book.contract.target_label}</h2>
          <p>
            Contrato {book.contract.id} ·{" "}
            <RecordStatus domain="capital" state={book.state} /> · Ocupación:{" "}
            <RecordStatus domain="contract" state={book.contract.status} />
          </p>
          {action?.kind === "conditions" ? (
            <ConditionsForm
              key={`${book.contract.id}-conditions-${book.version}`}
              book={book}
              base={`/properties/${propertyId}/anticreticos/${book.contract.id}`}
              people={related.candidates}
              propertyId={propertyId}
              onAdded={() => void related.reload()}
              onSaved={saved}
              onCancel={() => setAction(null)}
            />
          ) : action ? (
            <CapitalForm
              key={`${book.contract.id}-${action.kind}-${action.id || 0}`}
              book={book}
              base={`/properties/${propertyId}/anticreticos/${book.contract.id}`}
              people={related.candidates}
              methods={catalogs.methods}
              kind={action.kind}
              targetId={action.id}
              onSaved={saved}
              onCancel={() => setAction(null)}
            />
          ) : (
            <>
              <div className="form-actions">
                {admin && (
                  <button onClick={() => open("conditions")}>
                    {book.conditions
                      ? "Modificar condiciones económicas"
                      : "Completar capital acordado"}
                  </button>
                )}
                {canDeliver &&
                  book.conditions &&
                  !book.review_issues.length &&
                  exactCents(book.capital_to_receive) > 0n && (
                    <button onClick={() => open("delivery")}>
                      Registrar entrega de capital
                    </button>
                  )}
                {admin &&
                  book.conditions &&
                  !book.review_issues.length &&
                  exactCents(book.capital_pending) > 0n && (
                    <button onClick={() => open("return")}>
                      Registrar devolución de capital
                    </button>
                  )}
                {admin && exactCents(book.capital_received) > 0n && (
                  <button
                    className="secondary"
                    onClick={() => open("adjustment")}
                  >
                    Registrar acuerdo de restitución
                  </button>
                )}
                {admin && book.contract.status === "active" && (
                  <button className="secondary" onClick={() => open("extend")}>
                    Prorrogar ocupación
                  </button>
                )}
              </div>
              <nav
                className="utility-tabs finance-tabs"
                aria-label="Detalle del anticrético"
              >
                {[
                  ["capital", "Capital y cierre"],
                  ["parties", "Titulares y responsables"],
                  ["history", "Movimientos e historial"],
                  ["services", "Servicios básicos"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={detailTab === id ? "" : "secondary"}
                    aria-current={detailTab === id ? "page" : undefined}
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {detailTab === "capital" && (
                <>
                  <section className="panel">
                    <h3>Capital acordado y dinero real</h3>
                    {amounts(book)}
                    {exactCents(book.received_above_agreed) > 0n && (
                      <p role="alert">
                        El capital recibido supera el acuerdo vigente en{" "}
                        {money(book.received_above_agreed, book.currency)}. Su
                        dinero e historial se conservan; cualquier cambio de
                        restitución requiere otro acuerdo expreso.
                      </p>
                    )}
                    {book.review_issues.length > 0 && (
                      <div role="status">
                        <h4>Información económica pendiente</h4>
                        {book.review_issues.map((text) => (
                          <p key={text}>{text}</p>
                        ))}
                      </div>
                    )}
                    <p>
                      La entrega acordada no significa dinero recibido. Liquidar
                      el capital tampoco finaliza la ocupación.
                    </p>
                  </section>
                  <section className="panel">
                    <h3>Fechas y vista de cierre</h3>
                    <p>
                      Inicio contractual: {showDate(book.contract.start_date)} ·
                      Final pactado de ocupación:{" "}
                      {showDate(book.contract.end_date)}
                    </p>
                    <p>
                      Salida efectiva:{" "}
                      {book.contract.actual_end_date
                        ? showDate(book.contract.actual_end_date)
                        : "Sin finalización efectiva registrada"}
                    </p>
                    <p>
                      Entrega prevista del capital:{" "}
                      {book.conditions?.expected_delivery_on
                        ? showDate(book.conditions.expected_delivery_on)
                        : "Pendiente de completar"}
                    </p>
                    <p>
                      Restitución pactada:{" "}
                      {book.conditions?.restitution_on
                        ? showDate(book.conditions.restitution_on)
                        : "Pendiente de completar"}
                    </p>
                    <p>
                      Situación del capital:{" "}
                      <RecordStatus domain="capital" state={book.state} />.
                      Situación de ocupación:{" "}
                      <RecordStatus
                        domain="contract"
                        state={book.contract.status}
                      />
                      .
                    </p>
                    <p>
                      Servicios por cobrar registrados:{" "}
                      {
                        book.service_obligations.filter(
                          (o) => exactCents(o.pending) > 0n,
                        ).length
                      }
                      . Se conservan aunque se devuelva todo el capital.
                    </p>
                    {book.conditions && (
                      <>
                        <p>
                          Condiciones particulares: {book.conditions.conditions}
                        </p>
                        <p>
                          Documento externo:{" "}
                          {book.conditions.document_reference ||
                            "Sin referencia adicional"}
                        </p>
                        <p>
                          Observaciones:{" "}
                          {book.conditions.notes || "Sin observaciones"}
                        </p>
                      </>
                    )}
                  </section>
                </>
              )}
              {detailTab === "parties" && (
                <>
                  <h3>Titulares con derecho a restitución</h3>
                  <RecordCollection
                    id={`capital:${book.contract.id}:holders`}
                    label="titulares"
                    items={book.holders}
                    searchable={(h) =>
                      `${name(h.person_id)} ${name(h.beneficiary_person_id)}`
                    }
                    render={(h) => (
                      <RecordRow
                        key={h.person_id}
                        title={name(h.person_id)}
                        fields={
                          <>
                            <RecordField label="Autorizado a recibir">
                              {name(h.beneficiary_person_id)}
                            </RecordField>
                            <RecordField label="Parte acordada">
                              {money(h.assigned_amount, book.currency)}
                            </RecordField>
                            <RecordField label="Pendiente">
                              {money(h.pending || "0", book.currency)}
                            </RecordField>
                          </>
                        }
                        detail={
                          <dl className="record-row-fields">
                            <RecordField label="Capital asignado en entregas">
                              {money(h.received || "0", book.currency)}
                            </RecordField>
                            <RecordField label="Devuelto">
                              {money(h.returned || "0", book.currency)}
                            </RecordField>
                            <RecordField label="Ajustes">
                              {money(h.adjustments || "0", book.currency)}
                            </RecordField>
                          </dl>
                        }
                      />
                    )}
                  />
                  <h3>Responsables contractuales de devolver</h3>
                  <RecordCollection
                    id={`capital:${book.contract.id}:responsibles`}
                    label="responsables de restitución"
                    items={book.responsibles}
                    searchable={(r) => name(r.person_id)}
                    render={(r) => (
                      <RecordRow
                        key={r.person_id}
                        title={name(r.person_id)}
                        fields={
                          <>
                            <RecordField label="Parte acordada">
                              {money(r.assigned_amount, book.currency)}
                            </RecordField>
                            <RecordField label="Restituido por su cuenta">
                              {money(r.returned || "0", book.currency)}
                            </RecordField>
                            <RecordField label="Pendiente">
                              {money(r.pending || "0", book.currency)}
                            </RecordField>
                          </>
                        }
                      />
                    )}
                  />
                  <p>
                    Ser ocupante, pagador físico o propietario firmante no
                    asigna automáticamente derechos u obligaciones de capital.
                  </p>
                </>
              )}
              {detailTab === "history" && (
                <>
                  <h3>Entregas y devoluciones reales</h3>
                  <RecordCollection
                    id={`capital:${book.contract.id}:movements`}
                    label="movimientos de capital"
                    items={book.movements}
                    searchable={(m) =>
                      `${m.id} ${m.kind === "delivery" ? "Entrega" : "Devolución"} ${name(m.payer_id)} ${name(m.beneficiary_person_id)} ${m.occurred_on} ${m.reference ?? ""} ${m.document_reference ?? ""}`
                    }
                    filter={{
                      label: "Tipo de movimiento de capital",
                      value: (m) =>
                        m.kind === "delivery" ? "Entrega" : "Devolución",
                    }}
                    empty="No se registraron entregas ni devoluciones de dinero."
                    render={(m) => (
                      <RecordRow
                        key={m.id}
                        title={`${m.kind === "delivery" ? "Entrega de capital" : "Devolución de capital"} · ${money(m.amount, book.currency)}`}
                        fields={
                          <>
                            <RecordField label="Fecha">
                              {showDate(m.occurred_on)}
                            </RecordField>
                            <RecordField label="Entregó o pagó">
                              {name(m.payer_id)}
                            </RecordField>
                            <RecordField label="Recibió">
                              {name(m.beneficiary_person_id)}
                            </RecordField>
                            <RecordField label="Estado">
                              <StatusIndicator
                                tone={m.void_operation_id ? "gray" : "green"}
                                label={
                                  m.void_operation_id
                                    ? "Movimiento anulado"
                                    : "Movimiento válido"
                                }
                              />
                            </RecordField>
                          </>
                        }
                        actions={
                          admin &&
                          !m.void_operation_id && (
                            <button
                              className="secondary"
                              onClick={() => open("void", m.id)}
                            >
                              Anular movimiento {m.id}
                            </button>
                          )
                        }
                        detail={
                          <>
                            <dl className="record-row-fields">
                              <RecordField label="Método">
                                {catalogs.methods.find(
                                  (x) => x.id === m.method_id,
                                )?.name || "Registrado"}
                              </RecordField>
                              <RecordField label="Referencia">
                                {m.reference || "Sin referencia externa"}
                              </RecordField>
                              <RecordField label="Comprobante">
                                {m.document_reference ||
                                  "Sin referencia adicional"}
                              </RecordField>
                              <RecordField label="Usuario que registró">
                                {m.created_by}
                              </RecordField>
                            </dl>
                            <RecordCollection
                              id={`capital:${book.contract.id}:movements:${m.id}:allocations`}
                              label="asignaciones de capital"
                              items={m.allocations}
                              searchable={(a) =>
                                `${name(a.holder_id)} ${name(a.responsible_id)} ${money(a.amount, book.currency)}`
                              }
                              render={(a) => (
                                <RecordRow
                                  key={`${a.holder_id}:${a.responsible_id}`}
                                  title={name(a.holder_id)}
                                  fields={
                                    <>
                                      <RecordField label="Responsable">
                                        {name(a.responsible_id)}
                                      </RecordField>
                                      <RecordField label="Importe">
                                        {money(a.amount, book.currency)}
                                      </RecordField>
                                    </>
                                  }
                                />
                              )}
                            />
                          </>
                        }
                      />
                    )}
                  />
                  <h3>Acuerdos que modifican la restitución</h3>
                  <RecordCollection
                    id={`capital:${book.contract.id}:adjustments`}
                    label="acuerdos de restitución"
                    items={book.adjustments}
                    searchable={(a) =>
                      `${adjustmentNames[a.kind]} ${a.effective_on} ${a.reason} ${a.document_reference}`
                    }
                    filter={{
                      label: "Clase de acuerdo",
                      value: (a) => adjustmentNames[a.kind],
                    }}
                    render={(a) => (
                      <RecordRow
                        key={a.id}
                        title={adjustmentNames[a.kind]}
                        fields={
                          <>
                            <RecordField label="Fecha efectiva">
                              {showDate(a.effective_on)}
                            </RecordField>
                            <RecordField label="Estado">
                              <StatusIndicator
                                tone={a.void_operation_id ? "gray" : "blue"}
                                label={
                                  a.void_operation_id
                                    ? "Acuerdo anulado"
                                    : "Acuerdo vigente"
                                }
                              />
                            </RecordField>
                          </>
                        }
                        actions={
                          admin &&
                          !a.void_operation_id && (
                            <button
                              className="secondary"
                              onClick={() => open("voidAdjustment", a.id)}
                            >
                              Anular acuerdo {a.id}
                            </button>
                          )
                        }
                        detail={
                          <>
                            <p>
                              {a.reason} · Respaldo: {a.document_reference}
                            </p>
                            <RecordCollection
                              id={`capital:${book.contract.id}:adjustments:${a.id}:lines`}
                              label="asignaciones del acuerdo"
                              items={a.allocations}
                              searchable={(line) =>
                                `${name(line.holder_id)} ${name(line.responsible_id)} ${money(line.delta, book.currency)}`
                              }
                              render={(line) => (
                                <RecordRow
                                  key={`${line.holder_id}:${line.responsible_id}`}
                                  title={name(line.holder_id)}
                                  fields={
                                    <>
                                      <RecordField label="Responsable">
                                        {name(line.responsible_id)}
                                      </RecordField>
                                      <RecordField label="Ajuste">
                                        {money(line.delta, book.currency)}
                                      </RecordField>
                                    </>
                                  }
                                />
                              )}
                            />
                          </>
                        }
                      />
                    )}
                  />
                  <h3>Versiones de condiciones económicas</h3>
                  <RecordCollection
                    id={`capital:${book.contract.id}:versions`}
                    label="versiones de condiciones"
                    items={book.history}
                    searchable={(r) =>
                      `${r.revision} ${r.restitution_on ?? ""} ${r.created_at} ${r.reason ?? ""} ${r.document_reference ?? ""}`
                    }
                    render={(r) => (
                      <RecordRow
                        key={r.id}
                        title={`Versión ${r.revision} · ${money(r.agreed_capital, book.currency)}`}
                        fields={
                          <>
                            <RecordField label="Restitución">
                              {r.restitution_on
                                ? showDate(r.restitution_on)
                                : "Pendiente"}
                            </RecordField>
                            <RecordField label="Registro">
                              {new Date(r.created_at + "Z").toLocaleString(
                                "es-BO",
                              )}
                            </RecordField>
                            <RecordField label="Usuario">
                              {r.created_by}
                            </RecordField>
                          </>
                        }
                        detailLabel={`Ver personas y condiciones de la versión ${r.revision}`}
                        detail={
                          <>
                            <p>
                              {r.reason || "Registro inicial"} · Documento:{" "}
                              {r.document_reference ||
                                "Sin referencia adicional"}
                            </p>
                            <p>{r.conditions}</p>
                            <RecordCollection
                              id={`capital:${book.contract.id}:versions:${r.id}:parties`}
                              label="personas de esta versión"
                              items={[
                                ...r.holders.map((h) => ({
                                  ...h,
                                  role: "Titular",
                                })),
                                ...r.responsibles.map((d) => ({
                                  ...d,
                                  role: "Responsable",
                                })),
                              ]}
                              searchable={(party) =>
                                `${party.role} ${name(party.person_id)} ${name(party.beneficiary_person_id)}`
                              }
                              filter={{
                                label: "Participación",
                                value: (party) => party.role,
                              }}
                              render={(party) => (
                                <RecordRow
                                  key={`${party.role}:${party.person_id}`}
                                  title={name(party.person_id)}
                                  fields={
                                    <>
                                      <RecordField label="Participación">
                                        {party.role}
                                      </RecordField>
                                      <RecordField label="Parte acordada">
                                        {money(
                                          party.assigned_amount,
                                          book.currency,
                                        )}
                                      </RecordField>
                                      {party.role === "Titular" && (
                                        <RecordField label="Autorizado a recibir">
                                          {name(party.beneficiary_person_id)}
                                        </RecordField>
                                      )}
                                    </>
                                  }
                                />
                              )}
                            />
                          </>
                        }
                      />
                    )}
                  />
                </>
              )}
              {detailTab === "services" && (
                <>
                  <h3>Servicios independientes del capital</h3>
                  <p>
                    Las obligaciones provienen de repartos confirmados. Sus
                    pagos se registran en Pagos y gastos. No se descuentan
                    automáticamente del capital.
                  </p>
                  <RecordCollection
                    id={`capital:${book.contract.id}:services`}
                    label="obligaciones de servicios"
                    items={book.service_obligations}
                    searchable={(o) =>
                      `${o.concept} ${name(o.person_id)} ${o.period_start} ${financeStates[o.state]}`
                    }
                    filter={{
                      label: "Estado de la obligación",
                      value: (o) => financeStates[o.state] || o.state,
                    }}
                    empty="No hay importes de servicios registrados por cobrar para este contrato."
                    render={(o) => (
                      <RecordRow
                        key={o.id}
                        title={o.concept}
                        fields={
                          <>
                            <RecordField label="Titular">
                              {name(o.person_id)}
                            </RecordField>
                            <RecordField label="Periodo">
                              {showDate(o.period_start)} al{" "}
                              {showDate(o.effective_period_end)}
                            </RecordField>
                            <RecordField label="Pendiente">
                              {money(o.pending, o.currency)}
                            </RecordField>
                            <RecordField label="Estado">
                              <RecordStatus domain="finance" state={o.state} />
                            </RecordField>
                          </>
                        }
                      />
                    )}
                  />
                  {onFinances && (
                    <button onClick={() => onFinances(propertyId)}>
                      Abrir pagos de servicios
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <nav
            className="utility-tabs finance-tabs"
            aria-label="Consultas de anticréticos"
          >
            {[
              ["list", "Listado de anticréticos"],
              ["due", "Vencimientos"],
              ["summary", "Resumen del capital"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "" : "secondary"}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === "summary" ? (
            <>
              <h2>Resumen del capital por moneda</h2>
              <RecordCollection
                id={`${criteria}:balances`}
                label="saldos de capital por moneda"
                items={data.summary}
                searchable={(s) => s.currency}
                render={(s) => (
                  <RecordRow
                    key={s.currency}
                    title={`Capital en ${s.currency}`}
                    fields={
                      <>
                        <RecordField label="Anticréticos">
                          {s.count}
                        </RecordField>
                        <RecordField label="Condiciones pendientes">
                          {s.pending_conditions}
                        </RecordField>
                        <RecordField label={capitalLabels.capital_received}>
                          {money(s.capital_received, s.currency)}
                        </RecordField>
                        <RecordField label={capitalLabels.capital_pending}>
                          {money(s.capital_pending, s.currency)}
                        </RecordField>
                      </>
                    }
                    detail={
                      <dl className="record-row-fields">
                        {capitalFields
                          .filter(
                            (key) =>
                              key !== "capital_received" &&
                              key !== "capital_pending",
                          )
                          .map((key) => (
                            <RecordField key={key} label={capitalLabels[key]}>
                              {money(s[key], s.currency)}
                            </RecordField>
                          ))}
                      </dl>
                    }
                    detailLabel="Ver desglose del capital"
                  />
                )}
              />
            </>
          ) : (
            <>
              <SearchSelect
                label="Buscar contrato anticrético"
                options={data.items.map(({ contract }) => ({
                  value: contract.id,
                  label: `${contract.target_label} · ${name(contract.responsible_person_id)} · ${showDate(contract.start_date)}`,
                }))}
                value={contractFilter}
                onChange={setContractFilter}
                placeholder="Buscar por casa, cuarto, inquilino o número de contrato"
              />
              <Field label="Filtrar situación del anticrético">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="preparation">
                    Información económica pendiente
                  </option>
                  <option value="pending">
                    Capital pendiente de devolución
                  </option>
                  <option value="upcoming">Próximos vencimientos</option>
                  <option value="overdue">Restitución vencida</option>
                  <option value="finished">
                    Ocupación finalizada con capital pendiente
                  </option>
                  <option value="returned">Capital liquidado</option>
                </select>
              </Field>
              {(view === "due" || filter === "upcoming") && (
                <>
                  <Field label="Consultar próximos días">
                    <select
                      value={horizon}
                      onChange={(e) => setHorizon(Number(e.target.value))}
                    >
                      <option value={7}>7 días</option>
                      <option value={30}>30 días</option>
                      <option value={90}>90 días</option>
                    </select>
                  </Field>
                  <p>
                    Esta pantalla consulta fechas. No envía mensajes ni
                    recordatorios.
                  </p>
                </>
              )}
              <RecordCollection
                id={`capital:${propertyId}:${view}`}
                label="anticréticos"
                items={data.items.filter(
                  (item) =>
                    matches(item) &&
                    (!contractFilter ||
                      String(item.contract.id) === contractFilter),
                )}
                searchable={(b) =>
                  `${b.contract.id} ${b.contract.target_label} ${name(b.contract.responsible_person_id)} ${capitalStates[b.state]} ${b.conditions?.restitution_on ?? ""} ${money(b.capital_pending, b.currency)}`
                }
                empty="No hay anticréticos en esta selección."
                render={(b) => (
                  <RecordRow
                    key={b.contract.id}
                    title={`Anticrético · ${b.contract.target_label}`}
                    fields={
                      <>
                        <RecordField label="Contrato y responsable">
                          {b.contract.id} ·{" "}
                          {name(b.contract.responsible_person_id)}
                        </RecordField>
                        <RecordField label="Capital">
                          <RecordStatus domain="capital" state={b.state} />
                        </RecordField>
                        <RecordField label="Pendiente de devolución">
                          <strong>
                            {money(b.capital_pending, b.currency)}
                          </strong>
                        </RecordField>
                        <RecordField label="Final pactado">
                          {showDate(b.contract.end_date)}
                        </RecordField>
                        <RecordField label="Restitución">
                          {b.conditions?.restitution_on
                            ? showDate(b.conditions.restitution_on)
                            : "Sin fecha"}
                        </RecordField>
                      </>
                    }
                    actions={
                      <button
                        className="secondary"
                        onClick={() => {
                          setSelected(b.contract.id);
                          setDetailTab("capital");
                        }}
                      >
                        Ver capital del contrato {b.contract.id}
                      </button>
                    }
                  />
                )}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
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
import { showDate, stateNames, addDays } from "../tenancy";
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
  const [propertyId, setPropertyId] = useState(
      initialTarget?.propertyId || properties[0]?.id || 0,
    ),
    [selected, setSelected] = useState<number | null>(
      initialTarget?.contractId || null,
    ),
    [data, setData] = useState<CapitalData>(empty),
    [catalogs, setCatalogs] = useState<FinanceCatalogs>({
      methods: [],
      categories: [],
    }),
    [view, setView] = useState("list"),
    [detailTab, setDetailTab] = useState("capital"),
    [filter, setFilter] = useState("all"),
    [horizon, setHorizon] = useState(30),
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
      <Field label="Casa de los anticréticos">
        <select
          value={propertyId || ""}
          onChange={(e) => {
            setSelected(null);
            setAction(null);
            setPropertyId(Number(e.target.value));
          }}
        >
          <option value="">Seleccionar casa</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
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
            Contrato {book.contract.id} · {capitalStates[book.state]} ·
            Ocupación:{" "}
            {stateNames[book.contract.status] || book.contract.status}
          </p>
          {action?.kind === "conditions" ? (
            <ConditionsForm
              key={`${book.contract.id}-conditions-${book.version}`}
              book={book}
              base={`/properties/${propertyId}/anticreticos/${book.contract.id}`}
              people={related.candidates}
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
                      <strong>{capitalStates[book.state]}</strong>. Situación de
                      ocupación:{" "}
                      <strong>{stateNames[book.contract.status]}</strong>.
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
                  {book.holders.map((h) => (
                    <article className="panel" key={h.person_id}>
                      <h4>{name(h.person_id)}</h4>
                      <p>
                        Persona autorizada a recibir:{" "}
                        {name(h.beneficiary_person_id)}
                      </p>
                      <p>
                        Parte acordada:{" "}
                        {money(h.assigned_amount, book.currency)} · Capital
                        asignado en entregas:{" "}
                        {money(h.received || "0", book.currency)}
                      </p>
                      <p>
                        Devuelto: {money(h.returned || "0", book.currency)} ·
                        Ajustes: {money(h.adjustments || "0", book.currency)} ·
                        Pendiente:{" "}
                        <strong>
                          {money(h.pending || "0", book.currency)}
                        </strong>
                      </p>
                    </article>
                  ))}
                  <h3>Responsables contractuales de devolver</h3>
                  {book.responsibles.map((r) => (
                    <article className="panel" key={r.person_id}>
                      <h4>{name(r.person_id)}</h4>
                      <p>
                        Parte acordada:{" "}
                        {money(r.assigned_amount, book.currency)} · Restituido
                        por su cuenta: {money(r.returned || "0", book.currency)}{" "}
                        · Pendiente:{" "}
                        <strong>
                          {money(r.pending || "0", book.currency)}
                        </strong>
                      </p>
                    </article>
                  ))}
                  <p>
                    Ser ocupante, pagador físico o propietario firmante no
                    asigna automáticamente derechos u obligaciones de capital.
                  </p>
                </>
              )}
              {detailTab === "history" && (
                <>
                  <h3>Entregas y devoluciones reales</h3>
                  {book.movements.map((m) => (
                    <article className="panel" key={m.id}>
                      <h4>
                        {m.kind === "delivery"
                          ? "Entrega de capital"
                          : "Devolución de capital"}{" "}
                        · {money(m.amount, book.currency)}
                      </h4>
                      <p>
                        {m.void_operation_id
                          ? "Movimiento anulado; no integra los saldos"
                          : "Movimiento válido"}{" "}
                        · {showDate(m.occurred_on)}
                      </p>
                      <p>
                        Entregó/pagó: {name(m.payer_id)} · Recibió:{" "}
                        {name(m.beneficiary_person_id)}
                      </p>
                      <p>
                        Método:{" "}
                        {catalogs.methods.find((x) => x.id === m.method_id)
                          ?.name || "Registrado"}{" "}
                        · Referencia: {m.reference || "Sin referencia externa"}
                      </p>
                      <p>
                        Comprobante:{" "}
                        {m.document_reference || "Sin referencia adicional"} ·
                        Registró usuario {m.created_by}
                      </p>
                      {m.allocations.map((a, i) => (
                        <p key={i}>
                          Titular {name(a.holder_id)} · responsabilidad de{" "}
                          {name(a.responsible_id)}:{" "}
                          {money(a.amount, book.currency)}
                        </p>
                      ))}
                      {admin && !m.void_operation_id && (
                        <button
                          className="secondary"
                          onClick={() => open("void", m.id)}
                        >
                          Anular movimiento {m.id}
                        </button>
                      )}
                    </article>
                  ))}
                  {!book.movements.length && (
                    <p>No se registraron entregas ni devoluciones de dinero.</p>
                  )}
                  <h3>Acuerdos que modifican la restitución</h3>
                  {book.adjustments.map((a) => (
                    <article className="panel" key={a.id}>
                      <h4>
                        {adjustmentNames[a.kind]} ·{" "}
                        {a.void_operation_id
                          ? "Acuerdo anulado"
                          : "Acuerdo vigente"}
                      </h4>
                      <p>
                        {showDate(a.effective_on)} · {a.reason} · Respaldo:{" "}
                        {a.document_reference}
                      </p>
                      {a.allocations.map((line, i) => (
                        <p key={i}>
                          {name(line.holder_id)} · {name(line.responsible_id)}:{" "}
                          {money(line.delta, book.currency)}
                        </p>
                      ))}
                      {admin && !a.void_operation_id && (
                        <button
                          className="secondary"
                          onClick={() => open("voidAdjustment", a.id)}
                        >
                          Anular acuerdo {a.id}
                        </button>
                      )}
                    </article>
                  ))}
                  <h3>Versiones de condiciones económicas</h3>
                  {book.history.map((r) => (
                    <article className="panel" key={r.id}>
                      <h4>
                        Versión {r.revision} · capital acordado{" "}
                        {money(r.agreed_capital, book.currency)}
                      </h4>
                      <p>
                        Restitución:{" "}
                        {r.restitution_on
                          ? showDate(r.restitution_on)
                          : "Pendiente"}{" "}
                        · Registró usuario {r.created_by} ·{" "}
                        {new Date(r.created_at + "Z").toLocaleString("es-BO")}
                      </p>
                      <p>
                        {r.reason || "Registro inicial"} · Documento:{" "}
                        {r.document_reference || "Sin referencia adicional"}
                      </p>
                      <details>
                        <summary>
                          Ver personas y condiciones de la versión {r.revision}
                        </summary>
                        <p>{r.conditions}</p>
                        {r.holders.map((h) => (
                          <p key={h.person_id}>
                            Titular: {name(h.person_id)} ·{" "}
                            {money(h.assigned_amount, book.currency)} · recibe{" "}
                            {name(h.beneficiary_person_id)}
                          </p>
                        ))}
                        {r.responsibles.map((d) => (
                          <p key={d.person_id}>
                            Responsable: {name(d.person_id)} ·{" "}
                            {money(d.assigned_amount, book.currency)}
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
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
                  {book.service_obligations.map((o) => (
                    <article className="panel" key={o.id}>
                      <h4>
                        {o.concept} · {name(o.person_id)}
                      </h4>
                      <p>
                        {showDate(o.period_start)} al{" "}
                        {showDate(o.effective_period_end)} · pendiente{" "}
                        {money(o.pending, o.currency)}
                      </p>
                    </article>
                  ))}
                  {!book.service_obligations.length && (
                    <p>
                      No hay importes de servicios registrados por cobrar para
                      este contrato. Esto no confirma que todos sus recibos
                      hayan sido distribuidos.
                    </p>
                  )}
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
                onClick={() => {
                  setView(id);
                  if (id === "due") setFilter("upcoming");
                  else setFilter("all");
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === "summary" ? (
            <>
              <h2>Resumen del capital por moneda</h2>
              {data.summary.map((s) => (
                <section className="panel" key={s.currency}>
                  <h3>Capital en {s.currency}</h3>
                  <p>
                    Anticréticos: {s.count} · con condiciones pendientes:{" "}
                    {s.pending_conditions}
                  </p>
                  <dl className="finance-values">
                    {capitalFields.map((key) => (
                      <div key={key}>
                        <dt>{capitalLabels[key]}</dt>
                        <dd>{money(s[key], s.currency)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </>
          ) : (
            <>
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
              {data.items.filter(matches).map((b) => (
                <article className="panel" key={b.contract.id}>
                  <h2>Anticrético · {b.contract.target_label}</h2>
                  <p>
                    {name(b.contract.responsible_person_id)} · Contrato{" "}
                    {b.contract.id} · {capitalStates[b.state]}
                  </p>
                  <p>
                    Capital acordado: {money(b.capital_agreed, b.currency)} ·
                    Recibido: {money(b.capital_received, b.currency)} ·
                    Devuelto: {money(b.capital_returned, b.currency)}
                  </p>
                  <p>
                    <strong>
                      Pendiente de devolución:{" "}
                      {money(b.capital_pending, b.currency)}
                    </strong>
                  </p>
                  <p>
                    Final de ocupación pactado: {showDate(b.contract.end_date)}{" "}
                    · Restitución:{" "}
                    {b.conditions?.restitution_on
                      ? showDate(b.conditions.restitution_on)
                      : "Información pendiente"}
                  </p>
                  <button
                    onClick={() => {
                      setSelected(b.contract.id);
                      setDetailTab("capital");
                    }}
                  >
                    Ver capital del contrato {b.contract.id}
                  </button>
                </article>
              ))}
              {!data.items.filter(matches).length && (
                <p>
                  No hay anticréticos en esta selección. Los contratos se
                  registran desde Contratos, sin duplicar la ocupación aquí.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

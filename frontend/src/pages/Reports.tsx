import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { ErrorMessage, Field, errorText } from "../components/Form";
import {
  measureNames,
  money,
  presetDates,
  query,
  reportNames,
} from "../reports";
import type {
  Choice,
  Filters,
  ReportData,
  ReportKind,
  ReportOptions,
  ReportRow,
} from "../reports";
import "./reports.css";
const ReportChart = lazy(() => import("../components/ReportChart"));
const countNames: Record<string, string> = {
  properties_registered: "Propiedades registradas",
  properties_active: "Propiedades activas",
  units_available: "Cuartos disponibles",
  units_occupied: "Cuartos ocupados",
  contracts_active: "Contratos activos",
  contracts_ending: "Contratos que terminan en 30 días",
  reminders_attention: "Recordatorios que requieren atención",
};
const labels: Record<string, string> = {
  total: "Importe vigente",
  original: "Importe original",
  applied: "Aplicado",
  pending: "Pendiente",
  amount: "Importe del recibo",
  agreed: "Capital acordado",
  received: "Capital recibido",
  returned: "Capital devuelto",
  adjustments: "Ajustes sin dinero",
  owner_responsibility: "Parte del propietario",
  occupant_responsibility: "Parte del ocupante",
  provider_paid: "Pagado al proveedor",
  recovered: "Fondos aplicados a servicios",
  direct_paid: "Pago directo de servicios",
  reimbursement_pending: "Por recuperar con proveedor pagado",
  person: "Persona responsable",
  owner: "Propietario vinculado",
  property: "Propiedad",
  unit: "Espacio",
  concept: "Concepto",
  category: "Tipo de gasto",
  mode: "Modalidad",
  price: "Importe acordado actual del contrato",
  start_date: "Entrada",
  end_date: "Salida",
  period_start: "Periodo desde",
  period_end: "Periodo hasta",
  recorded_on: "Registrado el",
  due_on: "Vencimiento",
  restitution_on: "Restitución pactada",
  overdue_days: "Días de atraso",
  scope: "Alcance",
  state: "Estado",
  occupied_unit_days: "Días de cuartos ocupados",
  occurred_on: "Fecha del dinero",
  kind: "Tipo de movimiento",
  record_type: "Clase de registro",
  payer: "Pagador",
  beneficiary: "Destinatario",
  units_registered: "Cuartos registrados",
  voided_on: "Anulado el",
  contract_id: "Contrato",
  contract_state: "Estado actual de ocupación",
  filtered_person: "Persona vinculada consultada",
  agreement_scope: "Alcance del capital acordado",
};
const stateNames: Record<string, string> = {
  active: "Activo",
  finished: "Finalizado",
  draft: "Borrador",
  cancelled: "Cancelado",
  pending: "Pendiente",
  partial: "Pago parcial",
  paid: "Cubierto",
  overdue: "Vencido",
  adjusted: "Ajustado",
  voided: "Anulado",
  monthly: "Mensual",
  daily: "Diario",
  weekly: "Semanal",
  anticretico: "Anticrético",
  mixed: "Mixto",
  collection: "Cobro",
  advance: "Anticipo",
  guarantee: "Garantía",
  disbursement: "Desembolso propio",
  provider_direct: "Pago directo al proveedor",
  refund: "Devolución de fondos",
};
const economic = new Set([
  "total",
  "original",
  "applied",
  "pending",
  "amount",
  "agreed",
  "received",
  "returned",
  "price",
  "owner_responsibility",
  "occupant_responsibility",
  "provider_paid",
  "recovered",
  "direct_paid",
  "reimbursement_pending",
]);

function ChoiceField({
  label,
  name,
  choices,
  draft,
  set,
  all = "Todas las opciones",
}: {
  label: string;
  name: string;
  choices: Choice[];
  draft: Filters;
  set: (key: string, value: string) => void;
  all?: string;
}) {
  return (
    <Field label={label}>
      <select
        value={draft[name] || ""}
        onChange={(e) => set(name, e.target.value)}
      >
        <option value="">{all}</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function RowDetail({
  row,
  onProperty,
}: {
  row: ReportRow;
  onProperty: (id: number) => void;
}) {
  const title = String(
    row.description ||
      row.service ||
      row.owner ||
      (row.mode && row.contract_id
        ? `Contrato ${row.contract_id}`
        : row.property || row.unit || row.concept || "Registro"),
  );
  const fields = Object.entries(row).filter(
    ([key, value]) =>
      (labels[key] || measureNames[key]) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        value === null),
  );
  return (
    <article className="report-record">
      <h3>{title}</h3>
      {row.pending_financial_import === true && (
        <p className="permission-note">
          Este reparto confirmado todavía no se importó a Pagos y gastos. Los
          cargos conservan el último registro financiero; consultar este reporte
          no crea deudas.
        </p>
      )}
      <dl className="report-values">
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key] || measureNames[key]}</dt>
            <dd>
              {economic.has(key) || measureNames[key]
                ? money(value, row.currency)
                : value === null
                  ? "Sin información"
                  : stateNames[String(value)] || String(value)}
            </dd>
          </div>
        ))}
      </dl>
      {Array.isArray(row.occupants) && (
        <p>
          Ocupantes: {row.occupants.join(", ") || "Sin ocupantes adicionales"}
        </p>
      )}
      {Array.isArray(row.owners) && (
        <p>
          Firmantes propietarios: {row.owners.join(", ") || "Sin información"}
        </p>
      )}
      {Array.isArray(row.holders) && (
        <p>
          Titulares:{" "}
          {row.holders.map((h: Record<string, unknown>) => h.person).join(", ")}
        </p>
      )}
      {Array.isArray(row.responsibles) && (
        <p>
          Responsables de restitución:{" "}
          {row.responsibles
            .map((h: Record<string, unknown>) => h.person)
            .join(", ")}
        </p>
      )}
      {Array.isArray(row.contracts) && (
        <details>
          <summary>Ver contratos y periodos de esta unidad</summary>
          {(row.contracts as ReportRow[]).map((c) => (
            <p key={String(c.id)}>
              Contrato {String(c.id)} ·{" "}
              {stateNames[String(c.mode)] || String(c.mode)} ·{" "}
              {String(c.start_date)} a {String(c.end_date)} ·{" "}
              {stateNames[String(c.state)] || String(c.state)}
            </p>
          ))}
        </details>
      )}
      {Array.isArray(row.summary) && (
        <details>
          <summary>Ver importes de este contrato</summary>
          {(row.summary as Record<string, string>[]).map((s) => (
            <dl key={s.currency} className="report-values">
              {Object.entries(measureNames).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{money(s[key], s.currency)}</dd>
                </div>
              ))}
            </dl>
          ))}
        </details>
      )}
      {Array.isArray(row.obligations) && row.obligations.length > 0 && (
        <details>
          <summary>Ver cargos e historial económico</summary>
          {(row.obligations as ReportRow[]).map((o) => (
            <RowDetail key={String(o.id)} row={o} onProperty={onProperty} />
          ))}
        </details>
      )}
      {Array.isArray(row.adjustments) && row.adjustments.length > 0 && (
        <details>
          <summary>Ver ajustes registrados</summary>
          {(row.adjustments as ReportRow[]).map((a) => (
            <p key={String(a.id)}>
              {String(a.date)} · Cambio: {money(a.delta, row.currency)}
            </p>
          ))}
        </details>
      )}
      {Array.isArray(row.applications) && row.applications.length > 0 && (
        <details>
          <summary>Ver aplicaciones de pagos</summary>
          {(row.applications as ReportRow[]).map((a) => (
            <p key={String(a.id)}>
              {String(a.date || "")} · Aplicado: {money(a.amount, row.currency)}
            </p>
          ))}
        </details>
      )}
      {typeof row.property_id === "number" && (
        <button
          className="secondary"
          onClick={() => onProperty(row.property_id as number)}
        >
          Ver contratos de esta propiedad
        </button>
      )}
    </article>
  );
}

export function Reports({ view }: { view: "dashboard" | "reports" }) {
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [draft, setDraft] = useState<Filters>({});
  const [kind, setKind] = useState<ReportKind>("economic");
  const [applied, setApplied] = useState({
    filters: {} as Filters,
    kind: "economic" as ReportKind,
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false),
    [pdfStatus, setPdfStatus] = useState("");
  const [evolution, setEvolution] = useState("ordinary_received");
  const [paper, setPaper] = useState("A4");
  const version = useRef(0);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    api<ReportOptions>("/reports/options")
      .then((value) => {
        if (current) {
          setOptions(value);
          setDraft((old) =>
            Object.keys(old).length ? old : presetDates("month", value.today),
          );
        }
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      });
    return () => {
      current = false;
    };
  }, [reload]);
  useEffect(() => {
    const current = ++version.current;
    setBusy(true);
    setData(null);
    setError("");
    setPdfStatus("");
    const path =
      view === "dashboard" && applied.kind === "economic"
        ? "/dashboard"
        : `/reports/${applied.kind}`;
    api<ReportData>(path + query(applied.filters))
      .then((value) => {
        if (current !== version.current) return;
        setData(value);
        setCurrency((c) =>
          value.summary.some((s) => s.currency === c)
            ? c
            : value.summary[0]?.currency || "",
        );
      })
      .catch((e) => {
        if (current === version.current) setError(errorText(e));
      })
      .finally(() => {
        if (current === version.current) setBusy(false);
      });
    return () => {
      ++version.current;
    };
  }, [applied, view, reload]);
  function set(key: string, value: string) {
    setDraft((old) => {
      const next = { ...old, [key]: value };
      if (["property_id", "owner_id"].includes(key)) {
        next.unit_id = "";
        next.contract_id = "";
      }
      if (["start_date", "end_date"].includes(key)) {
        next.month = "";
        next.year = "";
      }
      if (["month", "year"].includes(key)) {
        next.start_date = "";
        next.end_date = "";
      }
      return next;
    });
  }
  function quick(name: string) {
    if (!options) return;
    setDraft((old) => ({
      ...old,
      ...presetDates(name, options.today),
      month: "",
      year: "",
      as_of: "",
    }));
  }
  async function pdf() {
    if (!data) return;
    setPdfBusy(true);
    setError("");
    setPdfStatus("Preparando el documento…");
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const response = await fetch(
        base +
          `/api/v1/reports/${applied.kind}/pdf` +
          query({
            ...applied.filters,
            paper,
            expected_fingerprint: data.fingerprint,
          }),
        { credentials: "include", signal: AbortSignal.timeout(60000) },
      );
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        const problem = await response.json();
        throw new ApiError(
          problem.detail || "No se pudo preparar el documento.",
          response.status,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mi-casa-${applied.kind}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdfStatus("El reporte está listo para descargar.");
    } catch (e) {
      setError(errorText(e));
      setPdfStatus("");
    } finally {
      setPdfBusy(false);
    }
  }
  const selected = data?.summary.find((s) => s.currency === currency);
  const points = data?.series.filter((s) => s.currency === currency) || [];
  const chart = (
    title: string,
    description: string,
    keys: string[],
    line = false,
  ) => (
    <ReportChart
      title={title}
      description={description}
      unit={currency || "Moneda sin datos"}
      months={points.map((p) => p.month)}
      line={line}
      series={keys.map((k) => ({
        name: measureNames[k],
        values: points.map((p) => (p.has_data ? p[k] : null)),
      }))}
    />
  );
  const mainMetrics = [
    "cash_received",
    "rent_pending",
    "service_pending",
    "expenses_recorded",
    "disbursed",
    "recoveries_pending",
    "capital_pending",
    "ordinary_received",
  ];
  const scopeChoices = (values: Choice[]) =>
    values.filter(
      (c) =>
        !draft.property_id ||
        !c.property_id ||
        String(c.property_id) === draft.property_id,
    );
  return (
    <section className="reports-page">
      <p className="eyebrow">INFORMACIÓN DE TUS PROPIEDADES</p>
      <h1>{view === "dashboard" ? "Resumen general" : "Reportes"}</h1>
      <p className="intro">
        Consulta tus resultados, revisa los detalles y guarda un documento para
        leer con tranquilidad.
      </p>
      <ErrorMessage message={error} />
      <form
        className="panel report-filter"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ filters: { ...draft, page: "1" }, kind });
        }}
      >
        <h2>¿Qué deseas consultar?</h2>
        <div className="report-filter-grid">
          {view === "reports" && (
            <Field label="Tipo de reporte">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ReportKind)}
              >
                {Object.entries(reportNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <ChoiceField
            label="Propiedad"
            name="property_id"
            choices={options?.properties || []}
            draft={draft}
            set={set}
            all="Todas mis propiedades autorizadas"
          />
          <Field label="Fecha inicial">
            <input
              type="date"
              value={draft.start_date || ""}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </Field>
          <Field label="Fecha final">
            <input
              type="date"
              value={draft.end_date || ""}
              onChange={(e) => set("end_date", e.target.value)}
            />
          </Field>
        </div>
        <div className="report-quick" aria-label="Periodos rápidos">
          <button
            type="button"
            className="secondary"
            onClick={() => quick("month")}
          >
            Este mes
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => quick("previous")}
          >
            Mes anterior
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => quick("quarter")}
          >
            Últimos tres meses
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => quick("year")}
          >
            Este año
          </button>
        </div>
        <details>
          <summary>Más filtros y fecha de corte</summary>
          <p>
            El dinero recibido se consulta por periodo. El pendiente se calcula
            a la fecha de corte; si la dejas vacía, se usa la fecha final hasta
            hoy.
          </p>
          <p>
            Activo, finalizado, borrador y cancelado se refieren al contrato
            actual. Pendiente, pago parcial, cubierto y vencido se refieren al
            estado económico al corte.
          </p>
          <div className="report-filter-grid">
            <ChoiceField
              label="Propietario vinculado"
              name="owner_id"
              choices={options?.owners || []}
              draft={draft}
              set={set}
            />
            <ChoiceField
              label="Cuarto o unidad"
              name="unit_id"
              choices={scopeChoices(options?.units || [])}
              draft={draft}
              set={set}
            />
            <ChoiceField
              label="Contrato"
              name="contract_id"
              choices={scopeChoices(options?.contracts || [])}
              draft={draft}
              set={set}
            />
            <ChoiceField
              label="Persona responsable"
              name="person_id"
              choices={options?.people || []}
              draft={draft}
              set={set}
            />
            <Field label="Modalidad">
              <select
                value={draft.mode || ""}
                onChange={(e) => set("mode", e.target.value)}
              >
                <option value="">Todas</option>
                {["daily", "weekly", "monthly", "anticretico", "mixed"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {stateNames[k]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <ChoiceField
              label="Tipo de servicio"
              name="service_type_id"
              choices={options?.services || []}
              draft={draft}
              set={set}
            />
            <ChoiceField
              label="Tipo de gasto"
              name="category_id"
              choices={options?.categories || []}
              draft={draft}
              set={set}
            />
            <Field label="Moneda de los registros">
              <input
                list="report-currencies"
                value={draft.currency || ""}
                maxLength={3}
                pattern="[A-Z]{3}|"
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
                placeholder="Todas"
              />
              <datalist id="report-currencies">
                <option>BOB</option>
                <option>USD</option>
                <option>EUR</option>
              </datalist>
            </Field>
            <Field label="Estado del registro">
              <select
                value={draft.state || ""}
                onChange={(e) => set("state", e.target.value)}
              >
                <option value="">Todos los estados</option>
                {[
                  "pending",
                  "partial",
                  "paid",
                  "overdue",
                  "adjusted",
                  "voided",
                  "active",
                  "finished",
                  "draft",
                  "cancelled",
                ].map((s) => (
                  <option key={s} value={s}>
                    {stateNames[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de corte del saldo">
              <input
                type="date"
                value={draft.as_of || ""}
                max={options?.today}
                onChange={(e) => set("as_of", e.target.value)}
              />
            </Field>
            <Field label="Mes (alternativa a fechas)">
              <select
                value={draft.month || ""}
                onChange={(e) => set("month", e.target.value)}
              >
                <option value="">Todo el año elegido</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {new Intl.DateTimeFormat("es", {
                      month: "long",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2030, i, 1)))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Año (alternativa a fechas)">
              <input
                type="number"
                min={1900}
                max={2200}
                value={draft.year || ""}
                onChange={(e) => set("year", e.target.value)}
              />
            </Field>
          </div>
        </details>
        <div className="report-quick">
          <button type="submit" disabled={busy || !options}>
            Ver resultados
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(options ? presetDates("month", options.today) : {});
              setApplied({ filters: {}, kind });
            }}
          >
            Restablecer filtros
          </button>
        </div>
      </form>
      {busy && <p role="status">Consultando los registros autorizados…</p>}
      {!busy && error && (
        <button className="secondary" onClick={() => setReload((v) => v + 1)}>
          Volver a consultar
        </button>
      )}
      {data && (
        <>
          {options && data.period.as_of !== options.today && (
            <p className="permission-note" role="status">
              Los saldos usan hechos registrados al corte. La ficha del contrato
              y la ocupación por fechas muestran sus versiones actuales; no
              certifican condiciones históricas.
            </p>
          )}
          <section aria-label="Resultados del reporte">
            <h2>{data.title}</h2>
            <p className="report-period">
              Del {data.period.start} al {data.period.end} · Saldo al{" "}
              {data.period.as_of} · Bolivia
            </p>
            <p>
              {data.properties.map((p) => p.name).join(" · ") ||
                "No hay propiedades autorizadas."}
            </p>
            <div className="report-export">
              <Field label="Tamaño de papel">
                <select
                  value={paper}
                  onChange={(e) => setPaper(e.target.value)}
                >
                  <option value="A4">A4</option>
                  <option value="letter">Carta</option>
                </select>
              </Field>
              <button
                className="secondary"
                onClick={() => void pdf()}
                disabled={pdfBusy}
              >
                {pdfBusy ? "Preparando PDF…" : "Exportar PDF"}
              </button>
            </div>
            <p role="status" aria-live="polite">
              {pdfStatus}
            </p>
            {!data.has_data && (
              <p className="permission-note">No hay datos para este periodo.</p>
            )}
            {view === "dashboard" && (
              <div className="report-cards">
                {Object.entries(countNames).map(([k, v]) => (
                  <article key={k} aria-label={v} className="report-card">
                    <span>{v}</span>
                    <strong>
                      {data.counts[k] ?? "Sin información histórica"}
                    </strong>
                  </article>
                ))}
              </div>
            )}
            {data.summary.length > 0 && (
              <Field label="Moneda para las cifras y gráficos">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {data.summary.map((s) => (
                    <option key={s.currency}>{s.currency}</option>
                  ))}
                </select>
              </Field>
            )}
            {selected && (
              <>
                <div className="report-cards">
                  {mainMetrics.map((k) => (
                    <article
                      className="report-card"
                      aria-label={measureNames[k]}
                      key={k}
                    >
                      <span>{measureNames[k]}</span>
                      <strong>{money(selected[k], currency)}</strong>
                    </article>
                  ))}
                </div>
                <details className="panel">
                  <summary>Ver todos los importes separados</summary>
                  <p>
                    Las entradas totales incluyen cobros, garantías y capital.
                    Sus desgloses no se suman de nuevo. Aplicar un anticipo o
                    una garantía no crea otra entrada.
                  </p>
                  <dl className="report-values">
                    {Object.entries(measureNames).map(([k, v]) => (
                      <div key={k}>
                        <dt>{v}</dt>
                        <dd>{money(selected[k], currency)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </>
            )}
          </section>
          <details className="panel report-notes" open={!data.has_data}>
            <summary>Cómo interpretar estos resultados</summary>
            {data.limitations.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </details>
          {selected && (
            <section aria-label="Gráficos del reporte">
              <h2>Cómo cambian tus resultados</h2>
              <Suspense fallback={<p role="status">Preparando gráficos…</p>}>
                <div className="report-charts">
                  {chart(
                    "Dinero recibido por periodo",
                    "Entradas reales; cada clase se muestra por separado",
                    [
                      "ordinary_received",
                      "guarantees_received",
                      "capital_received_period",
                    ],
                  )}
                  {chart(
                    "Cargos, aplicaciones y saldo",
                    "Estado conocido al cierre de cada mes",
                    ["obligations_total", "obligations_applied", "pending"],
                  )}
                  {chart(
                    "Gastos y desembolsos",
                    "Registro del gasto y dinero propio entregado durante el periodo",
                    ["expenses_recorded", "disbursed"],
                  )}
                  {chart(
                    "Servicios básicos",
                    "Partes de recibos cerrados, fondos aplicados y saldo al cierre",
                    [
                      "owner_service_responsibility",
                      "occupant_service_responsibility",
                      "services_recovered",
                      "service_pending",
                    ],
                  )}
                  {chart(
                    "Capital de anticréticos",
                    "Capital acumulado al cierre; independiente del alquiler",
                    ["capital_received", "capital_returned", "capital_pending"],
                  )}
                  <ReportChart
                    title="Ocupación registrada"
                    description="Fechas de contratos válidos en su versión actual; no reconstruye cambios históricos"
                    unit="% de días de cuartos"
                    months={data.occupancy.map((p) => p.month)}
                    series={[
                      {
                        name: "Ocupación",
                        values: data.occupancy.map((p) => p.occupancy_percent),
                      },
                    ]}
                  />
                </div>
                <Field label="Medida para ver su evolución">
                  <select
                    value={evolution}
                    onChange={(e) => setEvolution(e.target.value)}
                  >
                    {[
                      "ordinary_received",
                      "cash_received",
                      "charges_recorded",
                      "pending",
                      "expenses_recorded",
                      "capital_pending",
                    ].map((k) => (
                      <option key={k} value={k}>
                        {measureNames[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                {chart(
                  "Evolución de la medida elegida",
                  `Periodo ${data.period.start} a ${data.period.end}`,
                  [evolution],
                  true,
                )}
              </Suspense>
            </section>
          )}
          <section aria-label="Detalle del reporte">
            <h2>Revisar los registros</h2>
            <p>
              {data.total_rows} registros · Página {data.page}
            </p>
            {!data.rows.length && (
              <p>No hay registros de detalle para estos filtros.</p>
            )}
            {data.rows.map((row, i) => (
              <RowDetail
                key={
                  String(row.id || row.contract_id || row.unit_id || i) +
                  String(i)
                }
                row={row}
                onProperty={(id) => {
                  const next = {
                    ...applied.filters,
                    property_id: String(id),
                    unit_id: "",
                    contract_id: "",
                    page: "1",
                  };
                  setDraft(next);
                  setKind("contracts");
                  setApplied({ filters: next, kind: "contracts" });
                }}
              />
            ))}
            <div className="report-quick">
              <button
                className="secondary"
                disabled={data.page <= 1}
                onClick={() =>
                  setApplied((old) => ({
                    ...old,
                    filters: { ...old.filters, page: String(data.page - 1) },
                  }))
                }
              >
                Página anterior
              </button>
              <button
                className="secondary"
                disabled={data.page * data.page_size >= data.total_rows}
                onClick={() =>
                  setApplied((old) => ({
                    ...old,
                    filters: { ...old.filters, page: String(data.page + 1) },
                  }))
                }
              >
                Página siguiente
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

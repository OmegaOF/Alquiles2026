import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Field, ErrorMessage, errorText } from "../components/Form";
import type { Person, Property, User } from "../types";
import type {
  Reminder,
  ReminderData,
  ReminderOrigin,
  ReminderTarget,
} from "../reminders";
import {
  money,
  showDate,
  addDays,
  newFinanceKey,
  reminderKinds,
  priorities,
  attentionNames,
  reportStates,
} from "../reminders";
import { MessageComposer } from "./reminders/MessageComposer";
import { Consents } from "./reminders/Consents";
import { Preferences } from "./reminders/Preferences";
import { CommunicationHistory } from "./reminders/CommunicationHistory";
import { PaymentReports } from "./reminders/PaymentReports";

export function Reminders({
  user,
  properties,
  initialTarget,
  onOrigin,
}: {
  user: User;
  properties: Property[];
  initialTarget?: ReminderTarget | null;
  onOrigin: (propertyId: number, origin: ReminderOrigin) => void;
}) {
  const [propertyId, setPropertyId] = useState(
      initialTarget?.propertyId || properties[0]?.id || 0,
    ),
    [data, setData] = useState<ReminderData | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [view, setView] = useState("all"),
    [selectedKey, setSelectedKey] = useState<string | null>(
      initialTarget?.noticeKey || null,
    ),
    [composer, setComposer] = useState(false),
    [consentTarget, setConsentTarget] = useState<{
      personId: number;
      purpose: string;
    } | null>(null),
    [detailHistory, setDetailHistory] = useState(false),
    [filterType, setFilterType] = useState(""),
    [filterPriority, setFilterPriority] = useState(""),
    [filterPerson, setFilterPerson] = useState(0),
    [filterUnit, setFilterUnit] = useState(""),
    [filterState, setFilterState] = useState(""),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState("reviewed");
  const seq = useRef(0),
    current = useRef(propertyId),
    actionKey = useRef(newFinanceKey());
  current.current = propertyId;
  const admin = ["general_admin", "property_admin"].includes(user.role),
    canWrite = user.role !== "owner",
    base = `/properties/${propertyId}/reminders`;
  async function load() {
    if (!propertyId || current.current !== propertyId) return;
    const request = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const [d, p] = await Promise.all([
        api<ReminderData>(base),
        api<Person[]>(`/properties/${propertyId}/contacts`),
      ]);
      if (request === seq.current) {
        setData(d);
        setPeople(p);
      }
    } catch (e) {
      if (request === seq.current) setError(errorText(e));
    } finally {
      if (request === seq.current) setBusy(false);
    }
  }
  useEffect(() => {
    setData(null);
    setPeople([]);
    setComposer(false);
    setDetailHistory(false);
    setSelectedKey(
      initialTarget?.propertyId === propertyId
        ? initialTarget.noticeKey || null
        : null,
    );
    setNotice("");
    setFilterPerson(0);
    setFilterUnit("");
    void load();
    return () => {
      seq.current++;
    };
  }, [propertyId]);
  const selected = data?.items.find((e) => e.key === selectedKey);
  async function saved() {
    await load();
  }
  function changeView(v: string) {
    setView(v);
    setSelectedKey(null);
    setComposer(false);
    setDetailHistory(false);
    setNotice("");
    setFilterType("");
    setFilterPriority("");
    setFilterState("");
  }
  function showDetail(e: Reminder) {
    setSelectedKey(e.key);
    setComposer(false);
    setDetailHistory(false);
    actionKey.current = newFinanceKey();
    setNotice("");
  }
  async function act(e: React.FormEvent<HTMLFormElement>, event: Reminder) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    if (
      !window.confirm(
        action === "snoozed"
          ? "¿Posponer solamente la atención de este aviso? La fecha real de vencimiento no cambia."
          : action === "reviewed"
            ? "¿Marcar que revisaste este aviso? La deuda seguirá pendiente y se reactivará la atención en el siguiente hito o si cambia el origen."
            : "¿Reabrir la atención de este aviso?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/notices/${event.key}/actions`, "POST", {
        request_key: actionKey.current,
        expected_version: event.version,
        expected_fingerprint: event.attention_fingerprint,
        action,
        until_on: action === "snoozed" ? String(values.get("until_on")) : null,
        notes: String(values.get("notes") || "") || null,
      });
      await load();
      actionKey.current = newFinanceKey();
      setNotice(
        "Acción guardada. El saldo y vencimiento original se conservan.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function amount(e: Reminder) {
    if (e.amount === null) return null;
    const label =
      e.kind === "capital"
        ? "Capital pendiente de devolver"
        : e.kind === "report"
          ? "Importe reportado"
          : e.kind === "provider"
            ? "Pendiente de pago al proveedor"
            : e.kind === "recovery"
              ? "Recuperación pendiente"
              : "Saldo pendiente";
    return (
      <p>
        {label}: <strong>{money(e.amount, e.currency || "BOB")}</strong>
      </p>
    );
  }
  function due(e: Reminder) {
    return (
      <p>
        {e.due_on ? (
          <>
            Vencimiento vigente: <strong>{showDate(e.due_on)}</strong>
            {e.days_overdue
              ? ` · ${e.days_overdue} días de atraso`
              : e.days_remaining !== null && e.days_remaining > 0
                ? ` · Faltan ${e.days_remaining} días`
                : ""}
          </>
        ) : e.kind === "report" && e.reported_on ? (
          `Fecha comunicada por la persona: ${showDate(e.reported_on)}. Pendiente de revisión, sin vencimiento inventado.`
        ) : (
          "Fecha pendiente de definir."
        )}
      </p>
    );
  }
  function fits(e: Reminder) {
    const tab =
      view === "all" ||
      (view === "upcoming" && ["upcoming", "today"].includes(e.priority)) ||
      (view === "overdue" && e.priority === "overdue") ||
      (view === "rent" && e.kind === "rent") ||
      (view === "services" && ["service", "recovery"].includes(e.kind)) ||
      (view === "owners" && ["provider", "expense"].includes(e.kind)) ||
      (view === "contracts" && e.kind === "contract") ||
      (view === "capital" && e.kind === "capital") ||
      (view === "attended" &&
        ["reviewed", "resolved"].includes(e.attention_state)) ||
      (view === "snoozed" && e.attention_state === "snoozed");
    return (
      tab &&
      (!filterType || e.kind === filterType) &&
      (!filterPriority || e.priority === filterPriority) &&
      (!filterPerson || e.person_id === filterPerson) &&
      (!filterUnit ||
        (filterUnit === "whole"
          ? e.unit_id === null
          : String(e.unit_id) === filterUnit)) &&
      (!filterState || e.attention_state === filterState) &&
      (!from || (!!e.due_on && e.due_on >= from)) &&
      (!through || (!!e.due_on && e.due_on <= through))
    );
  }
  const units = [
    ...new Map(
      (data?.items || [])
        .filter((e) => e.unit_id)
        .map((e) => [e.unit_id!, e.target_label]),
    ).entries(),
  ];
  return (
    <section>
      <p className="eyebrow">AVISOS BASADOS EN SALDOS Y FECHAS REALES</p>
      <h1>Recordatorios</h1>
      <p>
        Revisa qué requiere atención, quién es responsable y qué comunicación
        registraste. Los avisos no crean pagos ni deudas.
      </p>
      <Field label="Casa de los recordatorios">
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
      <div className="form-actions">
        <button
          className="secondary"
          onClick={() => void load()}
          disabled={busy || !propertyId}
        >
          Actualizar recordatorios
        </button>
        {data && (
          <p>
            Fecha de negocio en Bolivia: <strong>{showDate(data.today)}</strong>
          </p>
        )}
      </div>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!propertyId ? (
        <p>Selecciona una casa autorizada.</p>
      ) : !data ? (
        <p role="status">
          {busy
            ? "Consultando saldos y vencimientos…"
            : "No se pudieron cargar los avisos. Usa Actualizar recordatorios."}
        </p>
      ) : (
        <>
          <nav
            className="utility-tabs finance-tabs"
            aria-label="Consultas de recordatorios"
          >
            {[
              ["all", "Todos"],
              ["upcoming", "Por vencer"],
              ["overdue", "Vencidos"],
              ["rent", "Alquileres"],
              ["services", "Servicios"],
              ["owners", "Avisos de propietarios"],
              ["contracts", "Contratos"],
              ["capital", "Anticréticos"],
              ["reports", "Pagos pendientes de verificar"],
              ["attended", "Atendidos"],
              ["snoozed", "Pospuestos"],
              ["history", "Historial de comunicaciones"],
              ["preferences", "Preferencias"],
              ["consents", "Consentimientos"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "" : "secondary"}
                aria-current={view === id ? "page" : undefined}
                onClick={() => changeView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === "consents" ? (
            <Consents
              key={`${propertyId}-consents`}
              base={base}
              people={people}
              admin={admin}
              today={data.today}
              initial={consentTarget}
              onBack={
                consentTarget
                  ? () => {
                      setView("all");
                      setComposer(false);
                    }
                  : undefined
              }
            />
          ) : view === "preferences" ? (
            <Preferences
              key={`${propertyId}-preferences`}
              base={base}
              admin={admin}
              onSaved={saved}
            />
          ) : view === "reports" ? (
            <PaymentReports
              key={`${propertyId}-reports`}
              base={base}
              propertyId={propertyId}
              people={people}
              admin={admin}
              canWrite={canWrite}
              today={data.today}
              onFinances={() => onOrigin(propertyId, { module: "finances" })}
            />
          ) : view === "history" ? (
            <CommunicationHistory key={`${propertyId}-history`} base={base} />
          ) : selected ? (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setSelectedKey(null);
                  setComposer(false);
                  setDetailHistory(false);
                }}
              >
                ← Volver a los recordatorios
              </button>
              <h2>
                {selected.property_name} — {selected.target_label}
              </h2>
              <p>
                {selected.kind_label} ·{" "}
                <strong>{priorities[selected.priority]}</strong> ·{" "}
                {attentionNames[selected.attention_state]}
              </p>
              {composer ? (
                <MessageComposer
                  key={`${propertyId}-${selected.key}`}
                  event={selected}
                  base={base}
                  userId={user.id}
                  onSaved={saved}
                  onCancel={() => setComposer(false)}
                  onConsent={(personId, purpose) => {
                    setComposer(false);
                    setConsentTarget({ personId, purpose });
                    setView("consents");
                  }}
                />
              ) : (
                <>
                  <section className="panel">
                    <h3>{selected.concept}</h3>
                    <p>
                      Responsable: <strong>{selected.responsible_name}</strong>
                    </p>
                    {amount(selected)}
                    {due(selected)}
                    {selected.period && <p>Periodo: {selected.period}</p>}
                    {selected.applied && (
                      <p>
                        Pagos o saldos ya aplicados:{" "}
                        {money(selected.applied, selected.currency || "BOB")}.
                      </p>
                    )}
                    {selected.recorded_amount && (
                      <p>
                        Importe registrado:{" "}
                        {money(
                          selected.recorded_amount,
                          selected.currency || "BOB",
                        )}
                        {selected.paid !== undefined &&
                          ` · Dinero efectivamente pagado: ${money(selected.paid, selected.currency || "BOB")}`}
                        .
                      </p>
                    )}
                    {selected.kind === "capital" && (
                      <>
                        <p>
                          Titular del capital:{" "}
                          <strong>{selected.holder_name}</strong>. Beneficiario
                          autorizado para recibir:{" "}
                          <strong>
                            {selected.beneficiary_name ||
                              "Pendiente de definir en el acuerdo"}
                          </strong>
                          .
                        </p>
                        <p>
                          Capital efectivamente recibido en esta asignación:{" "}
                          {money(
                            selected.capital_received || "0",
                            selected.currency || "BOB",
                          )}{" "}
                          · Devuelto:{" "}
                          {money(
                            selected.capital_returned || "0",
                            selected.currency || "BOB",
                          )}
                          .
                        </p>
                        <p>
                          El capital conserva su propio saldo. No es alquiler,
                          garantía ni anticipo ordinario.
                        </p>
                      </>
                    )}
                    {selected.kind === "contract" && (
                      <p>
                        La finalización contractual y la deuda económica se
                        revisan por separado.
                      </p>
                    )}
                    {selected.report_state && (
                      <p>
                        Verificación del pago:{" "}
                        {reportStates[selected.report_state]}. Un reporte no
                        confirma un ingreso.
                      </p>
                    )}
                    {selected.resolved && <p>{selected.resolution_reason}</p>}
                    {selected.until_on && (
                      <p>
                        Atención pospuesta hasta el{" "}
                        {showDate(selected.until_on)}. El vencimiento original
                        no cambia.
                      </p>
                    )}
                    {(selected.review_issues || []).map((t) => (
                      <p key={t} role="alert">
                        {t}
                      </p>
                    ))}
                    <p>
                      Personas a quienes corresponde avisar:{" "}
                      {selected.recipients.map((p) => p.full_name).join(", ") ||
                        "Pendiente de definir en el origen"}
                      .
                    </p>
                    <div className="form-actions">
                      <button
                        className="secondary"
                        onClick={() =>
                          selected.origin.module === "reports"
                            ? changeView("reports")
                            : onOrigin(propertyId, selected.origin)
                        }
                      >
                        Consultar registro de origen
                      </button>
                      {canWrite &&
                        selected.requires_attention &&
                        selected.allow_whatsapp && (
                          <button onClick={() => setComposer(true)}>
                            Preparar WhatsApp
                          </button>
                        )}
                      <button
                        className="secondary"
                        onClick={() => setDetailHistory(!detailHistory)}
                      >
                        {detailHistory
                          ? "Ocultar comunicaciones"
                          : "Ver comunicaciones del aviso"}
                      </button>
                    </div>
                  </section>
                  {selected.requires_attention && (
                    <form
                      className="panel"
                      onSubmit={(e) => void act(e, selected)}
                    >
                      <h3>Mi atención de este aviso</h3>
                      <p>
                        Revisar o posponer no modifica el dinero. El aviso
                        vuelve a requerir atención al llegar a otro hito o si
                        cambian datos importantes.
                      </p>
                      <Field label="Acción sobre este aviso">
                        <select
                          value={action}
                          onChange={(e) => {
                            setAction(e.target.value);
                            actionKey.current = newFinanceKey();
                          }}
                        >
                          <option value="reviewed">Marcar como revisado</option>
                          <option value="snoozed">Posponer atención</option>
                          <option value="reopened">Reabrir atención</option>
                        </select>
                      </Field>
                      {action === "snoozed" && (
                        <Field label="Volver a atender el aviso el">
                          <input
                            name="until_on"
                            type="date"
                            min={addDays(data.today, 1)}
                            max={addDays(
                              data.today,
                              data.preferences.snooze_days,
                            )}
                            required
                          />
                        </Field>
                      )}
                      <Field label="Observaciones de mi revisión">
                        <textarea name="notes" maxLength={1000} />
                      </Field>
                      <button disabled={busy}>
                        Guardar mi revisión del aviso
                      </button>
                    </form>
                  )}
                  {selected.attention_history.length > 0 && (
                    <section className="panel">
                      <h3>Mi historial de atención</h3>
                      {selected.attention_history.map((h) => (
                        <p key={h.id}>
                          {h.kind === "reopened"
                            ? "Atención reabierta"
                            : h.kind === "reviewed"
                              ? "Aviso revisado"
                              : "Atención pospuesta"}{" "}
                          ·{" "}
                          {new Date(h.created_at + "Z").toLocaleString("es-BO")}
                          {h.notes && ` · ${h.notes}`}
                        </p>
                      ))}
                    </section>
                  )}
                  {detailHistory && (
                    <CommunicationHistory
                      key={`${propertyId}-${selected.key}-history`}
                      base={base}
                      noticeKey={selected.key}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <section className="panel">
                <h2>Resumen de atención</h2>
                <dl className="finance-values">
                  {["pending", "reviewed", "snoozed", "resolved"].map((k) => (
                    <div key={k}>
                      <dt>{attentionNames[k]}</dt>
                      <dd>{data.summary[k] || 0}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <details className="panel">
                <summary>Filtrar tipo, persona, cuarto o fechas</summary>
                <div className="form-grid">
                  <Field label="Tipo de recordatorio">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="">Todos los tipos</option>
                      {Object.entries(reminderKinds).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridad del aviso">
                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                    >
                      <option value="">Todas las prioridades</option>
                      {Object.entries(priorities).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Responsable del asunto">
                    <select
                      value={filterPerson || ""}
                      onChange={(e) => setFilterPerson(Number(e.target.value))}
                    >
                      <option value="">Todas las personas</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Casa completa o cuarto">
                    <select
                      value={filterUnit}
                      onChange={(e) => setFilterUnit(e.target.value)}
                    >
                      <option value="">Todos los espacios</option>
                      <option value="whole">Casa completa</option>
                      {units.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Estado de mi atención">
                    <select
                      value={filterState}
                      onChange={(e) => setFilterState(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      {Object.entries(attentionNames).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vencimientos desde">
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </Field>
                  <Field label="Vencimientos hasta">
                    <input
                      type="date"
                      value={through}
                      onChange={(e) => setThrough(e.target.value)}
                    />
                  </Field>
                </div>
              </details>
              {data.items.filter(fits).map((e) => (
                <article className="panel" key={e.key} data-testid={e.key}>
                  <h2>
                    {e.property_name} — {e.target_label}
                  </h2>
                  <p>
                    {e.kind_label} · <strong>{priorities[e.priority]}</strong>
                  </p>
                  <p>Responsable: {e.responsible_name}</p>
                  <p>
                    {e.concept}
                    {e.period && ` · ${e.period}`}
                  </p>
                  {amount(e)}
                  {due(e)}
                  <p>
                    Mi atención: {attentionNames[e.attention_state]}
                    {e.until_on && ` hasta ${showDate(e.until_on)}`}
                  </p>
                  <button
                    onClick={() => showDetail(e)}
                    aria-label={`Ver detalle de ${e.kind_label.toLowerCase()} para ${e.responsible_name}`}
                  >
                    Ver detalle del aviso
                  </button>
                </article>
              ))}
              {!data.items.filter(fits).length && (
                <p>
                  No hay avisos en esta selección. Actualiza para consultar
                  cambios en saldos y vencimientos.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

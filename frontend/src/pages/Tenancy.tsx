import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Person, Property, User } from "../types";
import { Field, ErrorMessage, errorText } from "../components/Form";
import {
  addDays,
  localToday,
  modeNames,
  showDate,
  stateNames,
} from "../tenancy";
import type { Contract, HistoryEntry, Reservation } from "../tenancy";

import { ContractWizard } from "./tenancy/ContractWizard";
import { ReservationForm } from "./tenancy/ReservationForm";
import { AvailabilityScreen, OccupancyScreen } from "./tenancy/Screens";
import { History, actionNames } from "./tenancy/Shared";

type View = "contracts" | "reservations" | "availability" | "occupancy";
type Props = {
  view: View;
  user: User;
  properties: Property[];
  people: Person[];
  refreshPeople: () => Promise<void>;
  onCapital?: (contract: Contract) => void;
  initialContractId?: number;
};
export function Tenancy({
  view,
  user,
  properties,
  people,
  refreshPeople,
  onCapital,
  initialContractId,
}: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]);
  const handledInitial = useRef<number | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Contract | null>(null),
    [events, setEvents] = useState<HistoryEntry[]>([]),
    [detailPeople, setDetailPeople] = useState<Person[]>([]);
  const [wizard, setWizard] = useState<{
      contract?: Contract;
      reservation?: Reservation;
    } | null>(null),
    [reservationForm, setReservationForm] =
      useState<Partial<Reservation> | null>(null);
  const [filter, setFilter] = useState(""),
    [action, setAction] = useState(""),
    [busy, setBusy] = useState(false);
  const canWrite = user.role !== "owner",
    canActivate =
      user.role === "general_admin" || user.role === "property_admin";
  const allPeople = [
    ...new Map([...people, ...detailPeople].map((p) => [p.id, p])).values(),
  ];
  const personName = (id: number) =>
    allPeople.find((p) => p.id === id)?.full_name ||
    `Persona registrada n.º ${id}`;
  const propertyName = (id: number) =>
    properties.find((p) => p.id === id)?.name || "Propiedad autorizada";
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [c, r] = await Promise.all([
        api<Contract[]>("/contracts"),
        api<Reservation[]>("/reservations"),
      ]);
      setContracts(c);
      setReservations(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    setSelected(null);
    setWizard(null);
    setReservationForm(null);
    setNotice("");
    setAction("");
  }, [view]);
  async function detail(contract: Contract) {
    setError("");
    try {
      const [current, history, contacts] = await Promise.all([
        api<Contract>(`/contracts/${contract.id}`),
        api<HistoryEntry[]>(`/contracts/${contract.id}/history`),
        api<Person[]>(`/properties/${contract.resolved_property_id}/contacts`),
      ]);
      setSelected(current);
      setEvents(history);
      setDetailPeople(contacts);
      setAction("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    if (initialContractId && handledInitial.current !== initialContractId) {
      const target = contracts.find((c) => c.id === initialContractId);
      if (target) {
        handledInitial.current = initialContractId;
        void detail(target);
      }
    }
  }, [initialContractId, contracts]);
  async function saved(contract: Contract) {
    await load();
    await refreshPeople();
    await detail(contract);
    setWizard(null);
    setNotice(
      "El contrato se guardó correctamente. No se generaron deudas ni pagos.",
    );
  }
  async function applyAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    if (
      !window.confirm(
        "¿Confirmar este cambio del contrato? Se conservará en el historial.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Contract>(
        `/contracts/${selected.id}/actions`,
        "POST",
        {
          action,
          reason: String(values.get("reason") || ""),
          end_date: values.get("end_date") || null,
          expected_version: selected.version,
        },
      );
      await load();
      await detail(result);
      setNotice("El cambio del contrato se registró correctamente.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function reservationAction(reservation: Reservation, kind: string) {
    if (
      !window.confirm(
        `¿${kind === "confirm" ? "Confirmar" : kind === "cancel" ? "Cancelar" : "Registrar el vencimiento de"} esta reserva?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/reservations/${reservation.id}/actions`, "POST", {
        action: kind,
        reason: "Acción confirmada desde la pantalla de reservas",
        expected_version: reservation.version,
      });
      await load();
      setNotice("El cambio de la reserva se guardó correctamente.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (wizard)
    return (
      <ContractWizard
        user={user}
        properties={properties}
        people={people}
        initial={wizard.contract}
        reservation={wizard.reservation}
        onCancel={() => setWizard(null)}
        onSaved={saved}
        refreshPeople={refreshPeople}
      />
    );
  if (reservationForm)
    return (
      <ReservationForm
        user={user}
        properties={properties}
        people={people}
        initial={reservationForm}
        onCancel={() => setReservationForm(null)}
        onSaved={async () => {
          setReservationForm(null);
          await load();
          await refreshPeople();
          setNotice(
            "La reserva se guardó correctamente. No se generaron cobros.",
          );
        }}
        refreshPeople={refreshPeople}
      />
    );
  if (selected)
    return (
      <section>
        <button
          className="text-button"
          onClick={() => {
            setSelected(null);
            setAction("");
            setNotice("");
          }}
        >
          ← Volver a {view === "reservations" ? "reservas" : "contratos"}
        </button>
        <div className="page-heading">
          <div>
            <p className="eyebrow">CONTRATO N.º {selected.id}</p>
            <h1>{propertyName(selected.resolved_property_id)}</h1>
            <p>
              {selected.target_label} · {modeNames[selected.mode]} ·{" "}
              <strong>{stateNames[selected.status]}</strong>
            </p>
          </div>
        </div>
        <ErrorMessage message={error} />
        {notice && (
          <p role="status" className="success-message">
            {notice}
          </p>
        )}
        <div className="panel">
          <h2>Fechas y personas</h2>
          <p>
            Entrada: {showDate(selected.start_date)} · Salida pactada:{" "}
            {showDate(selected.end_date)}
          </p>
          {selected.actual_end_date && (
            <p>Finalización real: {showDate(selected.actual_end_date)}</p>
          )}
          <p>
            Responsable:{" "}
            <strong>{personName(selected.responsible_person_id)}</strong>
          </p>
          <p>
            Ocupantes adicionales:{" "}
            {selected.occupant_ids.length
              ? selected.occupant_ids.map(personName).join(", ")
              : "Sin ocupantes adicionales."}
          </p>
          <h3>Propietarios firmantes registrados</h3>
          <p>
            {selected.owners.length
              ? selected.owners
                  .map(
                    (p) =>
                      `${personName(p.person_id)}${p.share ? ` (${p.share}%)` : ""}`,
                  )
                  .join(", ")
              : "Se registrarán al activar el contrato."}
          </p>
          <p className="muted">
            Estos titulares se conservan aunque después cambien los propietarios
            de la casa. Su participación no es un reparto de servicios ni de
            cobros.
          </p>
        </div>
        <div className="panel">
          <h2>Condiciones acordadas</h2>
          <p>
            {selected.price
              ? `${selected.price} ${selected.currency} · precio ${modeNames[selected.mode].toLowerCase()}`
              : "La tarifa ordinaria no contiene el capital del anticrético."}
          </p>
          {selected.mode === "daily" && (
            <>
              {selected.status === "finished" ? (
                <p>
                  Plazo pactado para el precio: {selected.periods.billable_days}{" "}
                  {selected.daily_count === "nights" ? "noches" : "días"}.
                  Ocupación registrada: {selected.periods.occupancy_days} días.
                  La finalización conserva el acuerdo original sin generar
                  cobros.
                </p>
              ) : (
                <p>
                  {selected.periods.billable_days}{" "}
                  {selected.daily_count === "nights"
                    ? "noches"
                    : "días cobrables"}
                  ; ocupación de {selected.periods.occupancy_days} días, con
                  entrada y salida incluidas.
                </p>
              )}
              <p>
                Todos los servicios básicos incluidos, incluso en estancias de
                más de 15 días.
              </p>
            </>
          )}
          {selected.mode === "weekly" && (
            <p>
              {selected.periods.full_weeks} semanas y{" "}
              {selected.periods.partial_days} días adicionales.{" "}
              {selected.weekly_partial_allowed
                ? "Se permiten periodos parciales."
                : "Solo semanas completas."}
            </p>
          )}
          {selected.mode === "monthly" && (
            <>
              <p>
                Periodo:{" "}
                {selected.monthly_period === "calendar"
                  ? "mes calendario"
                  : "aniversario de entrada"}
                . Primer periodo:{" "}
                {selected.first_period === "full" ? "completo" : "proporcional"}
                .{" "}
                {selected.payment_timing === "custom"
                  ? "Vencimiento según el acuerdo escrito."
                  : `Vencimiento: día ${selected.due_day}, ajustado al último día si el mes es más corto.`}
              </p>
              <div className="table-scroll">
                <table>
                  <caption>
                    Periodos contractuales · no son recibos ni periodos de
                    servicios
                  </caption>
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th>Días de estancia</th>
                      <th>Días reales del periodo</th>
                      <th>Vencimiento previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.periods.monthly_periods.map((p) => (
                      <tr key={p.start}>
                        <td>
                          {showDate(p.start)} al {showDate(p.end)}
                        </td>
                        <td>{p.occupied_days}</td>
                        <td>{p.period_days}</td>
                        <td>
                          {p.due_date
                            ? showDate(p.due_date)
                            : "Según acuerdo escrito"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {selected.mode === "anticretico" && (
            <div>
              <p>
                El capital, sus titulares y devoluciones se administran por
                separado en Anticréticos. La ocupación se conserva en este
                contrato.
              </p>
              {onCapital && (
                <button onClick={() => onCapital(selected)}>
                  Ver capital del anticrético
                </button>
              )}
            </div>
          )}
          {selected.mode === "mixed" && (
            <p>
              Modalidad mixta pendiente de revisión. No se puede activar en esta
              fase.
            </p>
          )}
          <p>
            Servicios:{" "}
            {selected.services_included
              ? "incluidos"
              : "según condiciones pactadas"}
            . {selected.service_terms}
          </p>
          <p>
            Modalidad de cobro:{" "}
            {selected.payment_timing === "advance"
              ? "anticipado"
              : selected.payment_timing === "arrears"
                ? "al finalizar el periodo"
                : "otro acuerdo escrito"}
            .
          </p>
          <p>
            Vencimientos pactados:{" "}
            {selected.due_terms || "Según la modalidad de cobro registrada."}
          </p>
          <p>
            Condiciones: {selected.conditions || "Sin condiciones adicionales."}
          </p>
          <p>Observaciones: {selected.notes || "Sin observaciones."}</p>
          <p className="permission-note">
            Esta pantalla registra acuerdos. No crea deudas, recibos, pagos ni
            cargos adicionales de servicios.
          </p>
        </div>
        {canWrite && (
          <div className="actions">
            {(selected.status === "draft" ||
              (selected.status === "active" && canActivate)) && (
              <button onClick={() => setWizard({ contract: selected })}>
                Modificar contrato
              </button>
            )}
            {selected.status === "draft" &&
              canActivate &&
              selected.mode !== "mixed" && (
                <button onClick={() => setAction("activate")}>
                  Activar contrato
                </button>
              )}
            {selected.status === "active" && canActivate && (
              <>
                <button onClick={() => setAction("finish")}>
                  Finalizar contrato
                </button>
                <button
                  className="secondary"
                  onClick={() => setAction("extend")}
                >
                  Prorrogar contrato
                </button>
              </>
            )}
            {(selected.status === "draft" ||
              (selected.status === "active" &&
                canActivate &&
                selected.start_date > localToday())) && (
              <button className="secondary" onClick={() => setAction("cancel")}>
                Cancelar contrato
              </button>
            )}
          </div>
        )}
        {action && (
          <form onSubmit={applyAction} className="panel">
            <h2>{actionNames[action]} del contrato</h2>
            {(action === "finish" || action === "extend") && (
              <Field
                label={
                  action === "finish"
                    ? "Fecha real de finalización"
                    : "Nueva fecha de salida"
                }
              >
                <input
                  type="date"
                  name="end_date"
                  required
                  min={selected.start_date}
                  max={action === "finish" ? localToday() : undefined}
                  defaultValue={
                    action === "finish"
                      ? selected.end_date < localToday()
                        ? selected.end_date
                        : localToday()
                      : addDays(selected.end_date, 1)
                  }
                />
              </Field>
            )}
            <Field label="Motivo del cambio">
              <textarea name="reason" minLength={3} maxLength={2000} required />
            </Field>
            <div className="actions">
              <button disabled={busy}>
                {busy ? "Guardando…" : "Confirmar cambio"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setAction("")}
              >
                Volver
              </button>
            </div>
          </form>
        )}
        <History events={events} personName={personName} />
      </section>
    );
  if (view === "availability")
    return <AvailabilityScreen properties={properties} />;
  if (view === "occupancy")
    return <OccupancyScreen properties={properties} people={people} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZA TUS ESTANCIAS</p>
          <h1>{view === "contracts" ? "Contratos" : "Reservas"}</h1>
          <p className="muted">
            {view === "contracts"
              ? "Acuerdos, personas y fechas con historial."
              : "Prepara una estancia sin generar pagos ni deudas."}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() =>
              view === "contracts" ? setWizard({}) : setReservationForm({})
            }
          >
            {view === "contracts" ? "Registrar contrato" : "Registrar reserva"}
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      <Field label="Filtrar por propiedad">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todas mis propiedades</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {loading ? (
        <p role="status">Cargando información…</p>
      ) : error ? (
        <button onClick={() => void load()}>Volver a cargar</button>
      ) : view === "contracts" ? (
        <div className="record-list">
          {contracts
            .filter((c) => !filter || c.resolved_property_id === Number(filter))
            .map((c) => (
              <article key={c.id}>
                <div className="record-main">
                  <h2>
                    Contrato {c.id} · {propertyName(c.resolved_property_id)}
                  </h2>
                  <p>
                    {modeNames[c.mode]} · {stateNames[c.status]} ·{" "}
                    {c.target_label}
                  </p>
                  <p>
                    {showDate(c.start_date)} al{" "}
                    {showDate(c.actual_end_date || c.end_date)}
                  </p>
                  <p>Responsable: {personName(c.responsible_person_id)}</p>
                </div>
                <button className="secondary" onClick={() => void detail(c)}>
                  Ver contrato <span className="sr-only">{c.id}</span>
                </button>
              </article>
            ))}
          {!contracts.length && (
            <p className="empty">Todavía no hay contratos para mostrar.</p>
          )}
        </div>
      ) : (
        <div className="record-list">
          {reservations
            .filter((r) => !filter || r.resolved_property_id === Number(filter))
            .map((r) => (
              <article key={r.id}>
                <div className="record-main">
                  <h2>
                    Reserva {r.id} · {propertyName(r.resolved_property_id)}
                  </h2>
                  <p>
                    {modeNames[r.mode]} ·{" "}
                    <strong>{stateNames[r.effective_status]}</strong> ·{" "}
                    {r.target_label}
                  </p>
                  <p>
                    {showDate(r.start_date)} al {showDate(r.end_date)} ·{" "}
                    {personName(r.person_id)}
                  </p>
                  {r.expires_at && (
                    <p>
                      Vence: {new Date(r.expires_at + "Z").toLocaleString("es")}
                    </p>
                  )}
                  {r.notes && <p>{r.notes}</p>}
                  {canWrite && (
                    <div className="actions">
                      {["pending", "confirmed"].includes(
                        r.effective_status,
                      ) && (
                        <>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => setReservationForm(r)}
                          >
                            Modificar reserva {r.id}
                          </button>
                          {r.effective_status === "pending" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void reservationAction(r, "confirm")
                              }
                            >
                              Confirmar reserva {r.id}
                            </button>
                          )}
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void reservationAction(r, "cancel")}
                          >
                            Cancelar reserva {r.id}
                          </button>
                        </>
                      )}
                      {canActivate && r.effective_status === "confirmed" && (
                        <button onClick={() => setWizard({ reservation: r })}>
                          Convertir reserva {r.id} en contrato
                        </button>
                      )}
                      {r.effective_status === "expired" &&
                        r.status !== "expired" && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void reservationAction(r, "expire")}
                          >
                            Registrar vencimiento {r.id}
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          {!reservations.length && (
            <p className="empty">Todavía no hay reservas para mostrar.</p>
          )}
        </div>
      )}
    </section>
  );
}

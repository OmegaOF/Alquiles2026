import { RecordStatus } from "../components/StatusIndicator";
import { useEffect, useState } from "react";
import { api } from "../api";
import { PropertySelect } from "../components/PropertySelect";
import type { Person, Property, User } from "../types";
import { Field, ErrorMessage, errorText } from "../components/Form";
import {
  ListPagination,
  ListSearch,
  useLocalList,
  useListPreference,
  RecordField,
  RecordRow,
  RecordCollection,
} from "../components/RecordList";
import {
  addDays,
  localToday,
  modeNames,
  showDate,
  stateNames,
} from "../tenancy";
import type {
  AvailabilityAction,
  AvailabilityQuery,
  Contract,
  HistoryEntry,
  RentalPreset,
  Reservation,
} from "../tenancy";

import { ContractWizard } from "./tenancy/ContractWizard";
import { ReservationForm } from "./tenancy/ReservationForm";
import { OccupancyScreen } from "./tenancy/Screens";
import { AvailabilityScreen } from "./tenancy/AvailabilityScreen";
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
  initialPropertyId?: number;
  users?: User[];
  availabilityAction?: AvailabilityAction;
  availabilityQuery?: AvailabilityQuery;
  onAvailabilityAction?: (
    action: AvailabilityAction,
    query: AvailabilityQuery,
  ) => void;
};
export function Tenancy(props: Props) {
  const { view, properties, people } = props;
  if (view === "availability") {
    return (
      <AvailabilityScreen
        properties={properties}
        initialPropertyId={props.initialPropertyId}
        initialQuery={props.availabilityQuery}
        canWrite={props.user.role !== "owner"}
        onAction={props.onAvailabilityAction}
      />
    );
  }
  if (view === "occupancy") {
    return <OccupancyScreen properties={properties} people={people} />;
  }
  return <RentalRecords key={view} {...props} view={view} />;
}

function RentalRecords({
  view,
  user,
  properties,
  people,
  refreshPeople,
  onCapital,
  initialContractId,
  initialPropertyId,
  users,
  availabilityAction,
}: Props & { view: "contracts" | "reservations" }) {
  const linkedContract =
    availabilityAction?.kind === "contract" ? availabilityAction : undefined;
  const linkedReservation =
    availabilityAction?.kind === "reservation" ? availabilityAction : undefined;
  const contractId = linkedContract?.id ?? initialContractId;
  const preset =
    availabilityAction?.kind === "createContract" ||
    availabilityAction?.kind === "reserve"
      ? availabilityAction.preset
      : undefined;
  const [contracts, setContracts] = useState<Contract[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Contract | null>(null),
    [events, setEvents] = useState<HistoryEntry[]>([]),
    [detailPeople, setDetailPeople] = useState<Person[]>([]);
  const [wizard, setWizard] = useState<{
      contract?: Contract;
      reservation?: Reservation;
      preset?: RentalPreset;
    } | null>(
      user.role !== "owner" && availabilityAction?.kind === "createContract"
        ? { preset: availabilityAction.preset }
        : null,
    ),
    [reservationForm, setReservationForm] =
      useState<Partial<Reservation> | null>(
        user.role !== "owner" && availabilityAction?.kind === "reserve"
          ? availabilityAction.preset
          : null,
      );
  const [filter, setFilter] = useListPreference(
      linkedContract || preset || initialPropertyId
        ? undefined
        : `tenancy:${view}:property`,
      String(
        linkedContract?.propertyId ??
          preset?.resolved_property_id ??
          initialPropertyId ??
          "",
      ),
    ),
    [statusFilter, setStatusFilter] = useListPreference(
      `tenancy:${view}:status`,
      "",
    ),
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
  const contractList = useLocalList(
    contracts.filter(
      (item) =>
        (!filter || item.resolved_property_id === Number(filter)) &&
        (!statusFilter || item.status === statusFilter),
    ),
    (item) =>
      `${item.id} ${item.target_label} ${propertyName(item.resolved_property_id)} ${personName(item.responsible_person_id)} ${stateNames[item.status]} ${modeNames[item.mode]} ${item.start_date} ${item.end_date}`,
    "tenancy:contracts",
  );
  const reservationList = useLocalList(
    reservations.filter(
      (item) =>
        linkedReservation ||
        ((!filter || item.resolved_property_id === Number(filter)) &&
          (!statusFilter || item.effective_status === statusFilter)),
    ),
    (item) =>
      `${item.id} ${item.target_label} ${propertyName(item.resolved_property_id)} ${personName(item.person_id)} ${stateNames[item.effective_status]} ${modeNames[item.mode]} ${item.start_date} ${item.end_date}`,
    "tenancy:reservations",
  );
  const list = view === "contracts" ? contractList : reservationList;
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (view === "contracts") {
        setContracts(await api<Contract[]>("/contracts"));
      } else if (linkedReservation) {
        setReservations([
          await api<Reservation>(`/reservations/${linkedReservation.id}`),
        ]);
      } else {
        setReservations(await api<Reservation[]>("/reservations"));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function detail(id: number, knownProperty?: number) {
    setError("");
    try {
      const [current, history] = await Promise.all([
        api<Contract>(`/contracts/${id}`),
        api<HistoryEntry[]>(`/contracts/${id}/history`),
      ]);
      const contacts = await api<Person[]>(
        `/properties/${knownProperty ?? current.resolved_property_id}/contacts`,
      );
      setSelected(current);
      setEvents(history);
      setDetailPeople(contacts);
      setAction("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (view === "contracts" && contractId) {
      void detail(contractId, linkedContract?.propertyId);
    } else {
      void load();
    }
  }, [view, contractId]);
  async function saved(contract: Contract) {
    await refreshPeople();
    await detail(contract.id, contract.resolved_property_id);
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
      await detail(result.id, result.resolved_property_id);
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
        users={users}
        people={people}
        initialPropertyId={Number(filter) || undefined}
        initial={wizard.contract}
        preset={wizard.preset}
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
        users={users}
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
            void load();
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
              <RecordStatus domain="contract" state={selected.status} />
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
              <RecordCollection
                id={`contract:${selected.id}:periods`}
                label="periodos contractuales"
                items={selected.periods.monthly_periods}
                searchable={(period) =>
                  `${period.start} ${period.end} ${period.due_date ?? "Según acuerdo escrito"}`
                }
                render={(period) => (
                  <RecordRow
                    key={period.start}
                    title={`${showDate(period.start)} al ${showDate(period.end)}`}
                    fields={
                      <>
                        <RecordField label="Días de estancia">
                          {period.occupied_days}
                        </RecordField>
                        <RecordField label="Días del periodo">
                          {period.period_days}
                        </RecordField>
                        <RecordField label="Vencimiento previsto">
                          {period.due_date
                            ? showDate(period.due_date)
                            : "Según acuerdo escrito"}
                        </RecordField>
                      </>
                    }
                  />
                )}
              />
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
        <History
          events={events}
          personName={personName}
          listId={`contract:${selected.id}:history`}
        />
      </section>
    );
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
        {canWrite && !linkedReservation && (
          <button
            onClick={() =>
              view === "contracts"
                ? setWizard({})
                : setReservationForm({
                    resolved_property_id: Number(filter) || undefined,
                  })
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
      {!linkedReservation && (
        <div className="inventory-filters">
          <PropertySelect
            label="Filtrar por propiedad"
            properties={properties}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              list.pagination.onPage(1);
            }}
            hint="Si no eliges una casa, se muestran todas las autorizadas."
          />
          <Field
            label={
              view === "contracts"
                ? "Estado del contrato"
                : "Estado de la reserva"
            }
          >
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                list.pagination.onPage(1);
              }}
            >
              <option value="">Todos los estados</option>
              {(view === "contracts"
                ? ["draft", "active", "finished", "cancelled"]
                : ["pending", "confirmed", "expired", "converted", "cancelled"]
              ).map((state) => (
                <option key={state} value={state}>
                  {stateNames[state]}
                </option>
              ))}
            </select>
          </Field>
          <ListSearch
            label={
              view === "contracts" ? "Buscar contratos" : "Buscar reservas"
            }
            placeholder="Número, casa, cuarto o persona"
            {...list.search}
          />
        </div>
      )}
      {loading ? (
        <p role="status">Cargando información…</p>
      ) : error ? (
        <button
          onClick={() => {
            if (contractId) {
              setLoading(true);
              void detail(contractId, linkedContract?.propertyId);
            } else {
              void load();
            }
          }}
        >
          Volver a cargar
        </button>
      ) : view === "contracts" ? (
        <div className="record-rows">
          {contractList.rows.map((c) => (
            <RecordRow
              key={c.id}
              title={`Contrato ${c.id} · ${propertyName(c.resolved_property_id)}`}
              fields={
                <>
                  <RecordField label="Espacio">{c.target_label}</RecordField>
                  <RecordField label="Responsable">
                    {personName(c.responsible_person_id)}
                  </RecordField>
                  <RecordField label="Modalidad">
                    {modeNames[c.mode]}
                  </RecordField>
                  <RecordField label="Estancia">
                    {showDate(c.start_date)} al{" "}
                    {showDate(c.actual_end_date || c.end_date)}
                  </RecordField>
                  <RecordField label="Estado">
                    <RecordStatus domain="contract" state={c.status} />
                  </RecordField>
                </>
              }
              actions={
                <button
                  className="secondary"
                  onClick={() => void detail(c.id, c.resolved_property_id)}
                >
                  Ver contrato <span className="sr-only">{c.id}</span>
                </button>
              }
            />
          ))}
          {!contractList.rows.length && (
            <p className="empty">
              {contracts.length
                ? "No se encontraron contratos."
                : "Todavía no hay contratos para mostrar."}
            </p>
          )}
        </div>
      ) : (
        <div className="record-rows">
          {reservationList.rows.map((r) => (
            <RecordRow
              key={r.id}
              title={`Reserva ${r.id} · ${propertyName(r.resolved_property_id)}`}
              fields={
                <>
                  <RecordField label="Espacio">{r.target_label}</RecordField>
                  <RecordField label="Persona">
                    {personName(r.person_id)}
                  </RecordField>
                  <RecordField label="Modalidad">
                    {modeNames[r.mode]}
                  </RecordField>
                  <RecordField label="Estancia">
                    {showDate(r.start_date)} al {showDate(r.end_date)}
                  </RecordField>
                  <RecordField label="Estado">
                    <RecordStatus
                      domain="reservation"
                      state={r.effective_status}
                    />
                  </RecordField>
                </>
              }
              detail={
                r.notes || r.expires_at ? (
                  <>
                    {r.expires_at && (
                      <p>
                        Vence:{" "}
                        {new Date(r.expires_at + "Z").toLocaleString("es")}
                      </p>
                    )}
                    {r.notes && <p>{r.notes}</p>}
                  </>
                ) : undefined
              }
              actions={
                canWrite && (
                  <>
                    {["pending", "confirmed"].includes(r.effective_status) && (
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
                            onClick={() => void reservationAction(r, "confirm")}
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
                  </>
                )
              }
            />
          ))}
          {!reservationList.rows.length && (
            <p className="empty">
              {reservations.length
                ? "No se encontraron reservas."
                : "Todavía no hay reservas para mostrar."}
            </p>
          )}
        </div>
      )}
      {!linkedReservation && !loading && !error && (
        <ListPagination
          label={view === "contracts" ? "contratos" : "reservas"}
          {...list.pagination}
        />
      )}
    </section>
  );
}

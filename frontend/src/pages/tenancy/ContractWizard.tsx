import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Person, Property, User } from "../../types";
import {
  Field,
  ErrorMessage,
  errorText,
  confirmFormDiscard,
  markFormChanged,
} from "../../components/Form";
import {
  addDays,
  daysBetween,
  localToday,
  modeNames,
  showDate,
  stateNames,
} from "../../tenancy";
import type { Availability, Contract, Mode, Reservation } from "../../tenancy";
import { usePropertyData, NewContact } from "./Shared";
import {
  SearchSelect,
  personOption,
  unitOption,
} from "../../components/SearchSelect";
import { PropertySelect } from "../../components/PropertySelect";
import { useRegistrySearch } from "../../components/registrySearch";
import { ContextDialog } from "../../components/ContextDialog";
import { PropertyForm, RoomForm } from "../Properties";

export function ContractWizard({
  user,
  properties: registeredProperties,
  users = [],
  initialPropertyId,
  people,
  initial,
  reservation,
  onCancel,
  onSaved,
  refreshPeople,
}: {
  user: User;
  properties: Property[];
  users?: User[];
  initialPropertyId?: number;
  people: Person[];
  initial?: Contract;
  reservation?: Reservation;
  onCancel: () => void;
  onSaved: (contract: Contract) => Promise<void>;
  refreshPeople: () => Promise<void>;
}) {
  const canActivate =
    user.role === "general_admin" || user.role === "property_admin";
  const [newHouse, setNewHouse] = useState<Property>();
  const properties =
    newHouse &&
    !registeredProperties.some((property) => property.id === newHouse.id)
      ? [...registeredProperties, newHouse]
      : registeredProperties;
  const form = useRef<HTMLFormElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(1),
    [propertyId, setPropertyId] = useState(
      initial?.resolved_property_id ||
        reservation?.resolved_property_id ||
        initialPropertyId ||
        properties[0]?.id ||
        0,
    ),
    [unitId, setUnitId] = useState(
      initial?.unit_id || reservation?.unit_id || 0,
    );
  const [mode, setMode] = useState<Mode>(
      initial?.mode || reservation?.mode || "daily",
    ),
    [responsible, setResponsible] = useState(
      initial?.responsible_person_id || reservation?.person_id || 0,
    ),
    [occupants, setOccupants] = useState<number[]>(initial?.occupant_ids || []);
  const [start, setStart] = useState(
      initial?.start_date || reservation?.start_date || localToday(),
    ),
    [end, setEnd] = useState(
      initial?.end_date || reservation?.end_date || localToday(),
    );
  const [ownerParties, setOwnerParties] = useState<
    { person_id: number; share: string | number | null }[]
  >(
    initial?.owners ||
      properties.find((p) => p.id === propertyId)?.owners ||
      [],
  );
  const [price, setPrice] = useState(initial?.price || ""),
    [currency, setCurrency] = useState(initial?.currency || "BOB"),
    [status, setStatus] = useState(
      initial?.status || (reservation ? "active" : "draft"),
    );
  const [count, setCount] = useState(initial?.daily_count || "inclusive"),
    [partial, setPartial] = useState(initial?.weekly_partial_allowed || false),
    [monthly, setMonthly] = useState(initial?.monthly_period || "anniversary"),
    [first, setFirst] = useState(initial?.first_period || "full"),
    [dueDay, setDueDay] = useState(String(initial?.due_day || 5));
  const [timing, setTiming] = useState(initial?.payment_timing || "advance"),
    [dueTerms, setDueTerms] = useState(initial?.due_terms || ""),
    [included, setIncluded] = useState(initial?.services_included || false),
    [serviceTerms, setServiceTerms] = useState(initial?.service_terms || ""),
    [conditions, setConditions] = useState(initial?.conditions || ""),
    [notes, setNotes] = useState(initial?.notes || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [adding, setAdding] = useState<"person" | "property" | "unit" | null>(null),
    [newPerson, setNewPerson] = useState<Person>(),
    [available, setAvailable] = useState<Availability | null>(null);
  const data = usePropertyData(
    propertyId,
    people,
    user.role === "general_admin",
  );
  const candidates =
    newPerson && !data.candidates.some((person) => person.id === newPerson.id)
      ? [...data.candidates, newPerson]
      : data.candidates;
  const findPeople = useRegistrySearch(
    user.role === "general_admin" ? "people" : "contacts",
    candidates.length,
    propertyId,
  );
  const name = (id: number) =>
    candidates.find((p) => p.id === id)?.full_name || "Persona registrada";
  function chooseProperty(id: number, owners: Property["owners"] = []) {
    setPropertyId(id);
    setUnitId(0);
    setResponsible(0);
    setNewPerson(undefined);
    setOccupants([]);
    setOwnerParties(owners);
  }
  function goTo(step: number) {
    setStep(step);
    requestAnimationFrame(() => stepHeading.current?.focus());
  }
  useEffect(() => {
    setAvailable(null);
  }, [propertyId, start, end]);
  useEffect(() => {
    if (mode === "mixed") setStatus("draft");
  }, [mode]);
  useEffect(() => {
    if (!propertyId || !start || !end || end < start) return;
    let valid = true;
    api<Availability>(
      `/properties/${propertyId}/availability?start=${start}&end=${end}`,
    )
      .then((value) => {
        if (valid) setAvailable(value);
      })
      .catch((e) => {
        if (valid) setError(errorText(e));
      });
    return () => {
      valid = false;
    };
  }, [propertyId, start, end]);
  const target = unitId
    ? available?.units.find((u) => u.unit_id === unitId)
    : available?.whole;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (busy) return;
    if (step < 4) {
      if (step === 2 && !ownerParties.length) {
        setError("Selecciona al menos un propietario firmante del contrato.");
        return;
      }
      if (step === 1 && end < start) {
        setError("La salida no puede ser anterior a la entrada.");
        return;
      }
      goTo(step + 1);
      return;
    }
    if (
      !window.confirm(
        "¿Confirmar el registro del contrato con los datos revisados?",
      )
    )
      return;
    setBusy(true);
    try {
      const body = {
        property_id: unitId ? null : propertyId,
        unit_id: unitId || null,
        responsible_person_id: responsible,
        occupant_ids: occupants.filter((id) => id !== responsible),
        owner_parties: ownerParties,
        mode,
        status,
        start_date: start,
        end_date: end,
        price: ["daily", "weekly", "monthly"].includes(mode)
          ? price || null
          : null,
        currency,
        daily_count: mode === "daily" ? count : null,
        weekly_partial_allowed: mode === "weekly" ? partial : null,
        monthly_period: mode === "monthly" ? monthly : null,
        first_period: mode === "monthly" ? first : null,
        due_day:
          mode === "monthly" && timing !== "custom" ? Number(dueDay) : null,
        payment_timing: timing,
        due_terms: dueTerms || null,
        services_included: mode === "daily" || included,
        service_terms: serviceTerms || null,
        conditions: conditions || null,
        notes: notes || null,
        expected_version: initial?.version || null,
      };
      const result = await api<Contract>(
        reservation
          ? `/reservations/${reservation.id}/convert`
          : initial
            ? `/contracts/${initial.id}`
            : "/contracts",
        initial ? "PATCH" : "POST",
        body,
      );
      await onSaved(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const titles = [
    "Casa, espacio y fechas",
    "Inquilino y firmantes",
    "Precio y condiciones",
    "Revisar el resumen",
  ];
  return (
    <section className="panel wizard">
      <p className="eyebrow">PASO {step} DE 4</p>
      <h1>
        {reservation
          ? "Convertir reserva en contrato"
          : initial
            ? "Modificar contrato"
            : "Registrar contrato"}
      </h1>
      <h2 tabIndex={-1} ref={stepHeading}>
        {titles[step - 1]}
      </h2>
      <progress aria-label="Avance del registro" max={4} value={step} />
      <ErrorMessage message={error || data.error} />
      <form
        ref={form}
        onSubmit={submit}
        data-guard-changes
        onChange={markFormChanged}
      >
        {step === 1 && (
          <>
            <PropertySelect
              label="Casa del contrato"
              properties={properties}
              value={propertyId || ""}
              required
              activeOnly={!initial && !reservation}
              disabled={!!initial || !!reservation}
              onChange={(value) => {
                const id = Number(value);
                chooseProperty(
                  id,
                  properties.find((property) => property.id === id)?.owners,
                );
              }}
            />
            {!initial && !reservation && user.role === "general_admin" && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding("property")}
              >
                + Registrar casa
              </button>
            )}
            {!properties.length && (
              <p>
                No hay propiedades autorizadas. Registra una propiedad o
                solicita acceso al administrador.
              </p>
            )}
            <SearchSelect
              label="Espacio a alquilar"
              value={unitId}
              disabled={
                !propertyId ||
                !!reservation ||
                (initial?.status === "active" &&
                  initial.start_date <= localToday())
              }
              options={[
                { value: 0, label: "Casa completa" },
                ...data.units.map((unit) => ({
                  ...unitOption(unit),
                  disabled: !unit.is_enabled || unit.maintenance,
                })),
              ]}
              onChange={(value) => setUnitId(Number(value))}
              placeholder="Buscar cuarto por nombre o código"
            />
            {!initial && !reservation && !!propertyId && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding("unit")}
              >
                + Registrar cuarto
              </button>
            )}
            {initial?.status === "active" &&
              initial.start_date <= localToday() && (
                <p>
                  Para cambiar de espacio una estancia que ya comenzó, finaliza
                  este contrato y registra otro. Así se conserva la ocupación
                  anterior.
                </p>
              )}
            <p className="permission-note">
              Alquilar la casa completa bloquea todos sus cuartos en las mismas
              fechas.
            </p>
            {target && (
              <p>
                <strong>{stateNames[target.state]}</strong>: {target.reason}
              </p>
            )}
            <Field label="Modalidad de alquiler">
              <select
                value={mode}
                disabled={!!reservation}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                {Object.entries(modeNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {mode === "daily" && (
              <p>
                Siempre incluye todos los servicios básicos, sin cargos
                adicionales por duración.
              </p>
            )}
            {mode === "anticretico" && (
              <p className="permission-note">
                Se registrarán inmueble, ocupantes, fechas y condiciones. El
                capital y las devoluciones se completan después en Anticréticos.
              </p>
            )}
            {mode === "mixed" && (
              <p className="permission-note">
                Solo se puede guardar como borrador para revisar condiciones. No
                se activan combinaciones ni cálculos ambiguos.
              </p>
            )}
            <div className="form-grid">
              <Field label="Fecha de entrada">
                <input
                  type="date"
                  required
                  value={start}
                  disabled={!!reservation || initial?.status === "active"}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Fecha de salida">
                <input
                  type="date"
                  required
                  min={start}
                  disabled={!!reservation}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            {mode === "weekly" && !reservation && (
              <Field label="Semanas completas (para calcular la salida)">
                <input
                  type="number"
                  min={1}
                  max={2600}
                  onChange={(e) => {
                    const weeks = Number(e.target.value);
                    if (weeks > 0 && start)
                      setEnd(addDays(start, weeks * 7 - 1));
                  }}
                />
              </Field>
            )}
            <p>
              Se ocupan {Math.max(0, daysBetween(start, end))} días, contando
              entrada y salida. El día de salida sigue bloqueado aunque el
              precio se cuente por noches.
            </p>
            {target && (
              <p
                className={
                  target.state === "available"
                    ? "success-message"
                    : "permission-note"
                }
              >
                {stateNames[target.state]}: {target.reason}
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <SearchSelect
              label="Persona responsable del contrato"
              required
              disabled={!!reservation}
              value={responsible || ""}
              options={candidates.map(personOption)}
              load={findPeople}
              placeholder="Buscar inquilino por nombre, documento o teléfono"
              onChange={(value) => {
                const id = Number(value);
                setResponsible(id);
                setOccupants(occupants.filter((personId) => personId !== id));
              }}
            />
            <p>
              La persona responsable y los ocupantes no necesitan cuentas de
              usuario.
            </p>
            {!reservation && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding("person")}
              >
                + Registrar inquilino
              </button>
            )}
            <fieldset>
              <legend>Ocupantes adicionales (opcional)</legend>
              {candidates
                .filter((p) => p.id !== responsible)
                .map((p) => (
                  <label className="check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={occupants.includes(p.id)}
                      onChange={(e) =>
                        setOccupants(
                          e.target.checked
                            ? [...occupants, p.id]
                            : occupants.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.full_name}
                  </label>
                ))}
            </fieldset>
            <fieldset>
              <legend>Propietarios firmantes del contrato</legend>
              <p>
                Revisa las personas que firman, especialmente si registras una
                estancia pasada. Se conservarán aunque cambie el dueño actual.
              </p>
              {candidates
                .filter((p) => p.is_owner)
                .map((p) => (
                  <label className="check" key={p.id}>
                    <input
                      type="checkbox"
                      disabled={initial?.status === "active"}
                      checked={ownerParties.some((o) => o.person_id === p.id)}
                      onChange={(e) =>
                        setOwnerParties(
                          e.target.checked
                            ? [
                                ...ownerParties,
                                { person_id: p.id, share: null },
                              ]
                            : ownerParties.filter((o) => o.person_id !== p.id),
                        )
                      }
                    />
                    {p.full_name}
                  </label>
                ))}
            </fieldset>
          </>
        )}
        {step === 3 && (
          <>
            <div className="form-grid">
              {["daily", "weekly", "monthly"].includes(mode) && (
                <Field
                  label={`Precio ${mode === "daily" ? "por día o noche" : mode === "weekly" ? "semanal" : "mensual"} acordado`}
                >
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max="999999999999.99"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {[...new Set(["BOB", "USD", "EUR", currency])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              {mode === "daily" && (
                <Field label="Forma de contar el precio">
                  <select
                    value={count}
                    onChange={(e) => setCount(e.target.value as typeof count)}
                  >
                    <option value="inclusive">
                      Días de entrada y salida incluidos
                    </option>
                    <option value="nights">Por noches</option>
                  </select>
                </Field>
              )}
              {mode === "weekly" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={partial}
                    onChange={(e) => setPartial(e.target.checked)}
                  />
                  Permitir semanas parciales
                </label>
              )}
              {mode === "monthly" && (
                <>
                  <Field label="Periodo mensual">
                    <select
                      value={monthly}
                      onChange={(e) =>
                        setMonthly(e.target.value as typeof monthly)
                      }
                    >
                      <option value="anniversary">
                        Desde el aniversario de entrada
                      </option>
                      <option value="calendar">Por mes calendario</option>
                    </select>
                  </Field>
                  <Field label="Primer periodo">
                    <select
                      value={first}
                      onChange={(e) => setFirst(e.target.value as typeof first)}
                    >
                      <option value="full">Cobro completo</option>
                      <option value="prorated">Cobro proporcional</option>
                    </select>
                  </Field>
                  {timing !== "custom" && (
                    <Field label="Día de vencimiento mensual">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        required
                        value={dueDay}
                        onChange={(e) => setDueDay(e.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}
              <Field label="Modalidad de cobro">
                <select
                  value={timing}
                  onChange={(e) => setTiming(e.target.value)}
                >
                  <option value="advance">Anticipado</option>
                  <option value="arrears">Al finalizar el periodo</option>
                  <option value="custom">Otro acuerdo escrito</option>
                </select>
              </Field>
              <Field label="Vencimientos pactados (especificar si hay otro acuerdo)">
                <textarea
                  value={dueTerms}
                  required={timing === "custom"}
                  maxLength={3000}
                  onChange={(e) => setDueTerms(e.target.value)}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={mode === "daily" || included}
                  disabled={mode === "daily"}
                  onChange={(e) => setIncluded(e.target.checked)}
                />
                Servicios básicos incluidos
              </label>
              <Field label="Condiciones de los servicios (opcional)">
                <textarea
                  value={serviceTerms}
                  maxLength={3000}
                  onChange={(e) => setServiceTerms(e.target.value)}
                />
              </Field>
              <Field label="Condiciones adicionales">
                <textarea
                  value={conditions}
                  required={mode === "mixed"}
                  maxLength={5000}
                  onChange={(e) => setConditions(e.target.value)}
                />
              </Field>
              <Field label="Observaciones (opcional)">
                <textarea
                  value={notes}
                  maxLength={3000}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <Field label="Estado al guardar">
                <select
                  value={status}
                  disabled={
                    !!initial ||
                    !!reservation ||
                    mode === "mixed" ||
                    !canActivate
                  }
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="draft">Borrador · no bloquea fechas</option>
                  {canActivate && (
                    <option value="active">Vigente · bloquea fechas</option>
                  )}
                </select>
              </Field>
            </div>
            <p className="muted">
              Los periodos del alquiler son independientes de las recibos de
              agua, luz u otros servicios. No se calculan cobros de servicios en
              esta etapa.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <div className="review">
              <h3>
                {properties.find((p) => p.id === propertyId)?.name} ·{" "}
                {unitId
                  ? data.units.find((u) => u.id === unitId)?.name
                  : "Casa completa"}
              </h3>
              <p>
                {modeNames[mode]} · {stateNames[status]}
              </p>
              <p>Responsable: {name(responsible)}</p>
              <p>
                Ocupantes: {occupants.map(name).join(", ") || "Sin adicionales"}
              </p>
              <p>
                Propietarios firmantes:{" "}
                {ownerParties.map((o) => name(o.person_id)).join(", ") ||
                  "Seleccione al menos uno antes de confirmar."}
              </p>
              <p>
                {showDate(start)} al {showDate(end)} · {daysBetween(start, end)}{" "}
                días de ocupación inclusiva
              </p>
              {mode === "daily" && (
                <p>
                  {count === "nights"
                    ? daysBetween(start, end) - 1
                    : daysBetween(start, end)}{" "}
                  {count === "nights" ? "noches" : "días cobrables"} · Todos los
                  servicios básicos incluidos.
                </p>
              )}
              <p>
                {["daily", "weekly", "monthly"].includes(mode)
                  ? `${price} ${currency} · precio ${modeNames[mode].toLowerCase()}`
                  : "Sin capital ni cálculos financieros."}
              </p>
              {target && (
                <p>
                  <strong>{stateNames[target.state]}</strong>: {target.reason}
                </p>
              )}
              <p>No se crean deudas ni pagos al guardar.</p>
            </div>
            <p>
              Revisa que el inmueble, las personas, las fechas y las condiciones
              sean correctos. Los cambios quedarán en el historial.
            </p>
            <label className="check">
              <input type="checkbox" required />
              He revisado los datos y confirmo el contrato
            </label>
            {mode === "mixed" && (
              <p>Se guardará un borrador, sin activar ocupación.</p>
            )}
          </>
        )}
        <div className="actions">
          {step > 1 && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => goTo(step - 1)}
            >
              Anterior
            </button>
          )}
          <button disabled={busy || !propertyId}>
            {busy
              ? "Guardando…"
              : step < 4
                ? "Siguiente"
                : reservation
                  ? "Crear contrato desde la reserva"
                  : "Guardar contrato"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={(event) => {
              if (confirmFormDiscard(event.currentTarget.form)) onCancel();
            }}
          >
            Cancelar registro
          </button>
        </div>
      </form>
      {adding === "person" && (
        <ContextDialog
          label="Registrar inquilino"
          onCancel={() => setAdding(null)}
        >
          <NewContact
            propertyId={propertyId}
            onCancel={() => setAdding(null)}
            onAdded={async (person) => {
              setNewPerson(person);
              setResponsible(person.id);
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(null);
              void data.reload();
              void refreshPeople().catch(() => {});
            }}
          />
        </ContextDialog>
      )}
      {adding === "property" && (
        <ContextDialog label="Registrar casa" onCancel={() => setAdding(null)}>
          <PropertyForm
            property={{}}
            people={people}
            users={users}
            general
            onCancel={() => setAdding(null)}
            onSaved={async (house) => {
              setNewHouse(house);
              chooseProperty(house.id, house.owners);
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(null);
              void refreshPeople().catch(() => {});
            }}
          />
        </ContextDialog>
      )}
      {adding === "unit" && (
        <ContextDialog
          label="Registrar cuarto"
          onCancel={() => setAdding(null)}
        >
          <RoomForm
            house={properties.find((house) => house.id === propertyId)}
            fixedHouse
            properties={properties}
            initial={{}}
            onCancel={() => setAdding(null)}
            onSaved={(_houseId, room) => {
              setUnitId(room.id);
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(null);
              void data.reload();
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

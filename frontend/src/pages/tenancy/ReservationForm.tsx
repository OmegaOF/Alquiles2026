import { useRef, useState } from "react";
import { api } from "../../api";
import type { Person, Property, User } from "../../types";
import {
  Field,
  ErrorMessage,
  errorText,
  confirmFormDiscard,
  markFormChanged,
} from "../../components/Form";
import { localToday, modeNames } from "../../tenancy";
import type { Mode, Reservation } from "../../tenancy";
import { usePropertyData, NewContact } from "./Shared";
import {
  SearchSelect,
  personOption,
  unitOption,
} from "../../components/SearchSelect";
import { PropertySelect } from "../../components/PropertySelect";
import { ContextDialog } from "../../components/ContextDialog";
import { useRegistrySearch } from "../../components/registrySearch";
import { PropertyForm } from "../Properties";

function localExpiry(value: string | null | undefined) {
  if (!value) return "";
  const instant = new Date(value + "Z");
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function ReservationForm({
  user,
  properties: registeredProperties,
  users = [],
  people,
  initial,
  onCancel,
  onSaved,
  refreshPeople,
}: {
  user: User;
  properties: Property[];
  users?: User[];
  people: Person[];
  initial: Partial<Reservation>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  refreshPeople: () => Promise<void>;
}) {
  const [newHouse, setNewHouse] = useState<Property>();
  const properties =
    newHouse && !registeredProperties.some((house) => house.id === newHouse.id)
      ? [...registeredProperties, newHouse]
      : registeredProperties;
  const form = useRef<HTMLFormElement>(null);
  const [propertyId, setPropertyId] = useState(
      initial.resolved_property_id || properties[0]?.id || 0,
    ),
    [unitId, setUnitId] = useState(initial.unit_id || 0),
    [personId, setPersonId] = useState(initial.person_id || 0),
    [mode, setMode] = useState<Mode>(initial.mode || "daily");
  const [start, setStart] = useState(initial.start_date || localToday()),
    [end, setEnd] = useState(initial.end_date || localToday()),
    [status, setStatus] = useState(initial.status || "pending"),
    [expiry, setExpiry] = useState(localExpiry(initial.expires_at)),
    [notes, setNotes] = useState(initial.notes || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [adding, setAdding] = useState<"person" | "property" | null>(null),
    [newPerson, setNewPerson] = useState<Person>();
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
  function chooseProperty(id: number) {
    setPropertyId(id);
    setUnitId(0);
    setPersonId(0);
    setNewPerson(undefined);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (
      !window.confirm(
        "¿Guardar esta reserva? Bloqueará las fechas hasta su cancelación, vencimiento o conversión en contrato.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/reservations${initial.id ? `/${initial.id}` : ""}`,
        initial.id ? "PATCH" : "POST",
        {
          property_id: unitId ? null : propertyId,
          unit_id: unitId || null,
          person_id: personId,
          mode,
          start_date: start,
          end_date: end,
          status,
          expires_at: expiry ? new Date(expiry).toISOString() : null,
          notes: notes || null,
          expected_version: initial.version || null,
        },
      );
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h1>{initial.id ? "Modificar reserva" : "Registrar reserva"}</h1>
      <p>
        Una reserva activa bloquea el inmueble. No crea cobros, anticipos ni
        deudas.
      </p>
      <ErrorMessage message={error || data.error} />
      <form
        ref={form}
        onSubmit={save}
        data-guard-changes
        onChange={markFormChanged}
      >
        <div className="form-grid">
          <div>
            <PropertySelect
              label="Casa de la reserva"
              required
              disabled={!!initial.id}
              activeOnly={!initial.id}
              properties={properties}
              value={propertyId || ""}
              onChange={(id) => chooseProperty(Number(id))}
            />
            {!initial.id && user.role === "general_admin" && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding("property")}
              >
                + Registrar casa
              </button>
            )}
          </div>
          <SearchSelect
            label="Espacio reservado"
            disabled={!propertyId}
            value={unitId}
            options={[
              { value: 0, label: "Casa completa" },
              ...data.units.map((unit) => ({
                ...unitOption(unit),
                disabled: !unit.is_enabled || unit.maintenance,
              })),
            ]}
            onChange={(id) => setUnitId(Number(id))}
            placeholder="Buscar cuarto por nombre o código"
          />
          <SearchSelect
            label="Persona que reserva"
            required
            disabled={!propertyId}
            value={personId || ""}
            options={candidates.map(personOption)}
            load={findPeople}
            onChange={(id) => setPersonId(Number(id))}
            placeholder="Buscar por nombre, documento o teléfono"
          />
          <Field label="Modalidad prevista">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              {Object.entries(modeNames)
                .filter(([key]) => key !== "mixed")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Entrada de la reserva">
            <input
              type="date"
              value={start}
              required
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Salida de la reserva">
            <input
              type="date"
              value={end}
              min={start}
              required
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Vencimiento de la reserva (opcional)">
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>
          <Field label="Estado de la reserva">
            <select
              value={status}
              disabled={!!initial.id}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmada</option>
            </select>
          </Field>
          <Field label="Observaciones de la reserva (opcional)">
            <textarea
              value={notes}
              maxLength={3000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        <p>
          Entrada y salida incluidas. El vencimiento usa la hora de este
          dispositivo. Si no se indica vencimiento, la reserva se libera al
          cancelarla o convertirla.
        </p>
        <button
          className="secondary"
          type="button"
          disabled={!propertyId}
          onClick={() => setAdding("person")}
        >
          Registrar nueva persona
        </button>
        <div className="actions">
          <button disabled={busy || !propertyId}>
            {busy ? "Guardando…" : "Guardar reserva"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              if (confirmFormDiscard(event.currentTarget.form)) onCancel();
            }}
            disabled={busy}
          >
            Cancelar registro
          </button>
        </div>
      </form>
      {adding === "person" && (
        <ContextDialog
          label="Registrar persona para la reserva"
          onCancel={() => setAdding(null)}
        >
          <NewContact
            propertyId={propertyId}
            onCancel={() => setAdding(null)}
            onAdded={async (person) => {
              setNewPerson(person);
              setPersonId(person.id);
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
              chooseProperty(house.id);
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(null);
              void refreshPeople().catch(() => {});
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

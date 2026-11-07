import { useState } from "react";
import { api } from "../../api";
import type { Person, Property, User } from "../../types";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { localToday, modeNames } from "../../tenancy";
import type { Mode, Reservation } from "../../tenancy";
import { usePropertyData, NewContact } from "./Shared";

function localExpiry(value: string | null | undefined) {
  if (!value) return "";
  const instant = new Date(value + "Z");
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function ReservationForm({
  user,
  properties,
  people,
  initial,
  onCancel,
  onSaved,
  refreshPeople,
}: {
  user: User;
  properties: Property[];
  people: Person[];
  initial: Partial<Reservation>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  refreshPeople: () => Promise<void>;
}) {
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
    [adding, setAdding] = useState(false);
  const data = usePropertyData(
    propertyId,
    people,
    user.role === "general_admin",
  );
  if (adding)
    return (
      <NewContact
        propertyId={propertyId}
        onCancel={() => setAdding(false)}
        onAdded={async (person) => {
          await data.reload();
          await refreshPeople();
          setPersonId(person.id);
          setAdding(false);
        }}
      />
    );
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Casa de la reserva">
            <select
              value={propertyId || ""}
              required
              disabled={!!initial.id}
              onChange={(e) => {
                setPropertyId(Number(e.target.value));
                setUnitId(0);
                setPersonId(0);
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
          <Field label="Espacio reservado">
            <select
              value={unitId}
              onChange={(e) => setUnitId(Number(e.target.value))}
            >
              <option value={0}>Casa completa</option>
              {data.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                  {!u.is_enabled
                    ? " · Deshabilitado"
                    : u.maintenance
                      ? " · En mantenimiento"
                      : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Persona que reserva">
            <select
              value={personId || ""}
              required
              onChange={(e) => setPersonId(Number(e.target.value))}
            >
              <option value="">Seleccionar persona</option>
              {data.candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>
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
          onClick={() => setAdding(true)}
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
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar registro
          </button>
        </div>
      </form>
    </section>
  );
}

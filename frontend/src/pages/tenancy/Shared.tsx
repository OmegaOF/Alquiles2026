import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Person } from "../../types";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { modeNames, showDate, stateNames } from "../../tenancy";
import type { HistoryEntry } from "../../tenancy";

export const actionNames: Record<string, string> = {
  create: "Registro",
  update: "Modificación",
  activate: "Activación",
  finish: "Finalización",
  cancel: "Cancelación",
  extend: "Prórroga",
  confirm: "Confirmación",
  expire: "Vencimiento",
  convert: "Conversión a contrato",
};

export function History({
  events,
  personName,
}: {
  events: HistoryEntry[];
  personName: (id: number) => string;
}) {
  return (
    <section className="panel">
      <h2>Historial de cambios</h2>
      {events.map((event) => (
        <article className="history-item" key={event.id}>
          <h3>
            {actionNames[event.action] || "Cambio registrado"} ·{" "}
            {new Date(event.created_at + "Z").toLocaleString("es")}
          </h3>
          {event.details.reason && <p>Motivo: {event.details.reason}</p>}
          {event.details.before && (
            <p>
              Antes: {showDate(event.details.before.start_date)} al{" "}
              {showDate(
                event.details.before.actual_end_date ||
                  event.details.before.end_date,
              )}{" "}
              · Responsable:{" "}
              {event.details.before.responsible_person_id
                ? personName(event.details.before.responsible_person_id)
                : "Sin responsable"}{" "}
              · Ocupantes:{" "}
              {(event.details.before.occupant_ids || [])
                .map(personName)
                .join(", ") || "Sin adicionales"}
            </p>
          )}
          {event.details.before && (
            <p>
              Acuerdo anterior:{" "}
              {event.details.before?.mode
                ? modeNames[event.details.before.mode]
                : "Sin modalidad"}{" "}
              ·{" "}
              {event.details.before?.price
                ? `${event.details.before.price} ${event.details.before.currency}`
                : "Sin importe ordinario"}{" "}
              ·{" "}
              {event.details.before?.unit_id
                ? `Unidad n.º ${event.details.before.unit_id}`
                : "Casa completa"}
            </p>
          )}
          <p>
            Después: {showDate(event.details.after.start_date)} al{" "}
            {showDate(
              event.details.after.actual_end_date ||
                event.details.after.end_date,
            )}{" "}
            · {stateNames[event.details.after.status || ""] || "Registrado"} ·
            Responsable:{" "}
            {event.details.after.responsible_person_id
              ? personName(event.details.after.responsible_person_id)
              : "Sin responsable"}{" "}
            · Ocupantes:{" "}
            {(event.details.after.occupant_ids || [])
              .map(personName)
              .join(", ") || "Sin adicionales"}
          </p>
          <p>
            Acuerdo registrado:{" "}
            {event.details.after.mode
              ? modeNames[event.details.after.mode]
              : "Sin modalidad"}{" "}
            ·{" "}
            {event.details.after.price
              ? `${event.details.after.price} ${event.details.after.currency}`
              : "Sin importe ordinario"}{" "}
            ·{" "}
            {event.details.after.unit_id
              ? `Unidad n.º ${event.details.after.unit_id}`
              : "Casa completa"}
          </p>
          {event.details.after.conditions && (
            <p>Condiciones: {event.details.after.conditions}</p>
          )}
        </article>
      ))}
      {!events.length && <p>Sin cambios registrados.</p>}
    </section>
  );
}

export function usePropertyData(
  propertyId: number,
  people: Person[],
  general: boolean,
) {
  const requestId = useRef(0);
  const [units, setUnits] = useState<
      {
        id: number;
        code: string;
        name: string;
        maintenance: boolean;
        is_enabled: boolean;
      }[]
    >([]),
    [contacts, setContacts] = useState<Person[]>([]),
    [error, setError] = useState("");
  async function load() {
    const request = ++requestId.current;
    setError("");
    if (!propertyId) {
      setUnits([]);
      setContacts([]);
      return;
    }
    try {
      const [u, c] = await Promise.all([
        api<typeof units>(`/properties/${propertyId}/units`),
        api<Person[]>(`/properties/${propertyId}/contacts`),
      ]);
      if (request === requestId.current) {
        setUnits(u);
        setContacts(c);
      }
    } catch (e) {
      if (request === requestId.current) setError(errorText(e));
    }
  }
  useEffect(() => {
    setUnits([]);
    setContacts([]);
    void load();
    return () => {
      requestId.current++;
    };
  }, [propertyId]);
  const candidates = [
    ...new Map(
      [...(general ? people : []), ...contacts].map((p) => [p.id, p]),
    ).values(),
  ];
  return { units, candidates, error, reload: load };
}

export function NewContact({
  propertyId,
  onAdded,
  onCancel,
}: {
  propertyId: number;
  onAdded: (person: Person) => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      !window.confirm(
        "¿Registrar esta persona para la propiedad? No se creará una cuenta de acceso.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const person = await api<Person>(
        `/properties/${propertyId}/contacts`,
        "POST",
        {
          full_name: String(data.get("name") || "").trim(),
          document: String(data.get("document") || "").trim() || null,
          phone: String(data.get("phone") || "").trim() || null,
        },
      );
      await onAdded(person);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Registrar persona para esta casa</h2>
      <ErrorMessage message={error} />
      <form onSubmit={save}>
        <Field label="Nombre completo de la nueva persona">
          <input name="name" minLength={2} maxLength={160} required />
        </Field>
        <Field label="Documento de la nueva persona (opcional)">
          <input name="document" maxLength={80} />
        </Field>
        <Field label="Teléfono de la nueva persona (opcional)">
          <input name="phone" type="tel" maxLength={40} />
        </Field>
        <div className="actions">
          <button disabled={busy}>Guardar persona</button>
          <button type="button" className="secondary" onClick={onCancel}>
            Volver al formulario
          </button>
        </div>
      </form>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Person, Property } from "../../types";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { localToday, showDate, stateNames } from "../../tenancy";
import type { Availability, Occupancy } from "../../tenancy";
import { History } from "./Shared";

export function AvailabilityScreen({ properties }: { properties: Property[] }) {
  const requestId = useRef(0);
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 0),
    [start, setStart] = useState(localToday()),
    [end, setEnd] = useState(localToday()),
    [data, setData] = useState<Availability | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    if (!propertyId) return;
    const request = ++requestId.current;
    setData(null);
    setBusy(true);
    setError("");
    try {
      const result = await api<Availability>(
        `/properties/${propertyId}/availability?start=${start}&end=${end}`,
      );
      if (request === requestId.current) setData(result);
    } catch (e) {
      if (request === requestId.current) setError(errorText(e));
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [propertyId]);
  return (
    <section>
      <p className="eyebrow">PLANIFICA TUS ESTANCIAS</p>
      <h1>Disponibilidad</h1>
      <p>
        La casa completa y cada cuarto tienen su propia disponibilidad. La
        entrada y la salida están incluidas.
      </p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <div className="form-grid">
          <Field label="Propiedad a consultar">
            <select
              required
              value={propertyId || ""}
              onChange={(e) => setPropertyId(Number(e.target.value))}
            >
              <option value="">Seleccionar propiedad</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Consultar desde">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field label="Consultar hasta">
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </Field>
        </div>
        <button disabled={busy || !propertyId}>
          {busy ? "Consultando…" : "Consultar disponibilidad"}
        </button>
      </form>
      <ErrorMessage message={error} />
      {data && !error && (
        <>
          <h2>
            {data.property_name} · {showDate(data.start_date)} al{" "}
            {showDate(data.end_date)}
          </h2>
          <p>
            Cuartos disponibles:{" "}
            {data.units.filter((u) => u.state === "available").length} de{" "}
            {data.units.length}.
          </p>
          <div className="property-grid">
            {[data.whole, ...data.units].map((item) => (
              <article key={item.unit_id || "whole"}>
                <h3>{item.label}</h3>
                <p className="badge">{stateNames[item.state]}</p>
                <p>{item.reason}</p>
                {item.blockers.length > 1 && (
                  <ul>
                    {item.blockers.slice(1).map((b) => (
                      <li key={b.kind + b.id}>{b.reason}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function OccupancyScreen({
  properties,
  people,
}: {
  properties: Property[];
  people: Person[];
}) {
  const requestId = useRef(0);
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 0),
    [rows, setRows] = useState<Occupancy[]>([]),
    [contacts, setContacts] = useState<Person[]>([]),
    [error, setError] = useState(""),
    [current, setCurrent] = useState(false);
  async function load() {
    if (!propertyId) return;
    const request = ++requestId.current;
    setRows([]);
    setError("");
    try {
      const [r, p] = await Promise.all([
        api<Occupancy[]>(`/properties/${propertyId}/occupancy`),
        api<Person[]>(`/properties/${propertyId}/contacts`),
      ]);
      if (request === requestId.current) {
        setRows(r);
        setContacts(p);
      }
    } catch (e) {
      if (request === requestId.current) setError(errorText(e));
    }
  }
  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [propertyId]);
  const name = (id: number) =>
    [...people, ...contacts].find((p) => p.id === id)?.full_name ||
    `Persona registrada n.º ${id}`;
  return (
    <section>
      <h1>Ocupantes e historial</h1>
      <p>
        Los contratos finalizados conservan sus personas y sus cambios
        anteriores.
      </p>
      <Field label="Propiedad del historial">
        <select
          value={propertyId || ""}
          onChange={(e) => setPropertyId(Number(e.target.value))}
        >
          <option value="">Seleccionar propiedad</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => setCurrent(e.target.checked)}
        />
        Mostrar solo ocupantes actuales
      </label>
      <ErrorMessage message={error} />
      {error && (
        <button onClick={() => void load()}>Volver a cargar historial</button>
      )}
      <div className="record-list">
        {rows
          .filter((r) => !current || r.current)
          .map((r) => (
            <article key={r.id}>
              <div className="record-main">
                <h2>
                  Contrato {r.id} · {stateNames[r.status]}
                </h2>
                <p>
                  {r.target_label} ·{" "}
                  {r.current ? "Ocupación actual" : "Estancia registrada"} ·{" "}
                  {showDate(r.start_date)} al{" "}
                  {showDate(r.actual_end_date || r.end_date)}
                </p>
                <p>Responsable: {name(r.responsible_person_id)}</p>
                <p>
                  Ocupantes adicionales:{" "}
                  {r.occupant_ids.map(name).join(", ") || "Sin adicionales"}
                </p>
                <details>
                  <summary>Ver cambios y ocupantes anteriores</summary>
                  <History events={r.history} personName={name} />
                </details>
              </div>
            </article>
          ))}
        {!rows.filter((r) => !current || r.current).length && !error && (
          <p className="empty">No hay ocupaciones para esta consulta.</p>
        )}
      </div>
    </section>
  );
}

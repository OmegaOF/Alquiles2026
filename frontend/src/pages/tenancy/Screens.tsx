import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { PropertySelect } from "../../components/PropertySelect";
import {
  ListPagination,
  ListSearch,
  useLocalList,
} from "../../components/RecordList";
import type { Person, Property } from "../../types";
import { ErrorMessage, errorText } from "../../components/Form";
import { showDate, stateNames } from "../../tenancy";
import type { Occupancy } from "../../tenancy";
import { History } from "./Shared";

export function OccupancyScreen({
  properties,
  people,
  heading = "Ocupantes e historial",
}: {
  properties: Property[];
  people: Person[];
  heading?: string;
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
  const listing = useLocalList(
    rows.filter((row) => !current || row.current),
    (row) =>
      `${row.id} ${row.target_label} ${name(row.responsible_person_id)} ${row.occupant_ids.map(name).join(" ")} ${stateNames[row.status]}`,
  );
  return (
    <section>
      <h1>{heading}</h1>
      <p>
        Los contratos finalizados conservan sus personas y sus cambios
        anteriores.
      </p>
      <PropertySelect
        label="Propiedad del historial"
        properties={properties}
        value={propertyId || ""}
        onChange={(id) => {
          setPropertyId(Number(id));
          listing.pagination.onPage(1);
        }}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => {
            setCurrent(e.target.checked);
            listing.pagination.onPage(1);
          }}
        />
        Mostrar solo ocupantes actuales
      </label>
      <ListSearch
        label="Buscar ocupaciones"
        placeholder="Número de contrato, cuarto o persona"
        {...listing.search}
      />
      <ErrorMessage message={error} />
      {error && (
        <button onClick={() => void load()}>Volver a cargar historial</button>
      )}
      <div className="record-list">
        {listing.rows.map((r) => (
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
        {!listing.rows.length && !error && (
          <p className="empty">No hay ocupaciones para esta consulta.</p>
        )}
      </div>
      <ListPagination label="ocupaciones" {...listing.pagination} />
    </section>
  );
}

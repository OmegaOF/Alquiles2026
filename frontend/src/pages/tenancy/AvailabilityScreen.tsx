import { useEffect, useState } from "react";
import { ErrorMessage, Field } from "../../components/Form";
import { PropertySelect } from "../../components/PropertySelect";
import {
  AvailabilitySummary,
  PropertyStatus,
  WholePropertyAvailability,
  availabilityStates,
} from "../../components/PropertyStatus";
import {
  ListPagination,
  ListSearch,
  lastPage,
  useListRequest,
  useLocalList,
} from "../../components/RecordList";
import { localToday, showDate, stateNames } from "../../tenancy";
import type {
  Availability,
  AvailabilityAction,
  AvailabilityBlocker,
  AvailabilityItem,
  AvailabilityQuery,
} from "../../tenancy";
import type { Property } from "../../types";

export function AvailabilityScreen({
  properties,
  initialPropertyId,
  initialQuery,
  canWrite,
  onAction,
}: {
  properties: Property[];
  initialPropertyId?: number;
  initialQuery?: AvailabilityQuery;
  canWrite: boolean;
  onAction?: (action: AvailabilityAction, query: AvailabilityQuery) => void;
}) {
  const [criteria, setCriteria] = useState<AvailabilityQuery>(() => {
    const today = localToday();
    return (
      initialQuery ?? {
        propertyId: initialPropertyId || properties[0]?.id || 0,
        start: today,
        end: today,
        query: "",
        state: "",
        page: 1,
      }
    );
  });
  const [propertyId, setPropertyId] = useState(criteria.propertyId);
  const [start, setStart] = useState(criteria.start);
  const [end, setEnd] = useState(criteria.end);
  const params = new URLSearchParams({
    start: criteria.start,
    end: criteria.end,
    page: String(criteria.page),
  });
  if (criteria.query) params.set("q", criteria.query);
  if (criteria.state) params.set("state", criteria.state);
  const { data, previousData, loading, error, reload } =
    useListRequest<Availability>(
      criteria.propertyId && criteria.propertyId === propertyId
        ? `/properties/${criteria.propertyId}/availability?${params}`
        : null,
      150,
    );
  const meta =
    data ??
    (previousData?.property_id === propertyId &&
    previousData.start_date === criteria.start &&
    previousData.end_date === criteria.end
      ? previousData
      : undefined);
  useEffect(() => {
    if (data && criteria.page > lastPage(data.total)) {
      setCriteria((current) => ({ ...current, page: lastPage(data.total) }));
    }
  }, [criteria.page, data]);
  function consult(id: number, retry = false) {
    if (!id || !start || !end || start > end) return;
    if (
      retry &&
      id === criteria.propertyId &&
      start === criteria.start &&
      end === criteria.end &&
      criteria.page === 1
    )
      reload();
    setCriteria((current) => ({
      ...current,
      propertyId: id,
      start,
      end,
      page: 1,
    }));
  }
  return (
    <section>
      <h1>Disponibilidad</h1>
      <p>La consulta incluye las fechas de entrada y salida.</p>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          consult(propertyId, true);
        }}
      >
        <div className="form-grid">
          <PropertySelect
            label="Propiedad a consultar"
            properties={properties}
            value={propertyId || ""}
            onChange={(value) => {
              const id = Number(value);
              setPropertyId(id);
              consult(id);
            }}
          />
          <Field label="Consultar desde">
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
          </Field>
          <Field label="Consultar hasta">
            <input
              type="date"
              value={end}
              min={start}
              onChange={(event) => setEnd(event.target.value)}
              required
            />
          </Field>
        </div>
        <button disabled={!propertyId}>Consultar disponibilidad</button>
      </form>
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary" onClick={reload}>
          Reintentar consulta
        </button>
      )}
      {meta && (
        <>
          <h2>
            {meta.property_name} · {showDate(meta.start_date)} al{" "}
            {showDate(meta.end_date)}
          </h2>
          {meta.summary && <AvailabilitySummary summary={meta.summary} />}
          <WholePropertyAvailability whole={meta.whole} />
        </>
      )}
      {criteria.propertyId === propertyId && !!propertyId && (
        <div className="inventory-filters">
          <ListSearch
            label="Buscar en disponibilidad"
            placeholder="Código o nombre"
            value={criteria.query}
            onChange={(query) =>
              setCriteria((current) => ({ ...current, query, page: 1 }))
            }
          />
          <Field label="Estado de disponibilidad">
            <select
              value={criteria.state}
              onChange={(event) => {
                const state = event.target.value as AvailabilityQuery["state"];
                setCriteria((current) => ({ ...current, state, page: 1 }));
              }}
            >
              <option value="">Todos los estados</option>
              {availabilityStates.map((state) => (
                <option key={state} value={state}>
                  {stateNames[state]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {loading && <p role="status">Consultando disponibilidad…</p>}
      {data &&
        (data.units.length ? (
          <div
            className="table-scroll compact-table"
            role="region"
            aria-label="Resultados de disponibilidad"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Disponibilidad de cuartos y unidades
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cuarto o unidad</th>
                  <th scope="col">Disponibilidad</th>
                  <th scope="col">Motivo principal</th>
                  <th scope="col">Fechas del impedimento</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((item) => (
                  <AvailabilityRow
                    key={item.unit_id}
                    item={item}
                    data={data}
                    canWrite={canWrite}
                    onAction={
                      onAction
                        ? (action) => onAction(action, criteria)
                        : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No se encontraron cuartos para la consulta.</p>
        ))}
      {meta && (
        <ListPagination
          label="disponibilidad"
          total={meta.total}
          page={Math.min(criteria.page, lastPage(meta.total))}
          onPage={(page) => setCriteria((current) => ({ ...current, page }))}
        />
      )}
    </section>
  );
}

function AvailabilityRow({
  item,
  data,
  canWrite,
  onAction,
}: {
  item: AvailabilityItem;
  data: Availability;
  canWrite: boolean;
  onAction?: (action: AvailabilityAction) => void;
}) {
  const principal =
    item.state === "occupied" || item.state === "reserved"
      ? item.blockers[0]
      : undefined;
  const others = principal ? item.blockers.slice(1) : item.blockers;
  const otherReasons = item.other_reasons ?? [];
  const code = item.code ?? item.label;
  const propertyId = data.property_id;
  const preset = {
    resolved_property_id: propertyId,
    unit_id: item.unit_id,
    start_date: data.start_date,
    end_date: data.end_date,
  };
  function openBlocker(blocker: AvailabilityBlocker) {
    onAction?.({ kind: blocker.kind, id: blocker.id, propertyId });
  }
  return (
    <tr>
      <th scope="row">
        <strong>{code}</strong>
        {item.name && (
          <>
            <br />
            {item.name}
          </>
        )}
      </th>
      <td>
        <PropertyStatus state={item.state} />
      </td>
      <td>
        {principal
          ? `${principal.kind === "contract" ? "Contrato" : "Reserva"} ${principal.id}`
          : item.reason}
        {(otherReasons.length > 0 || others.length > 0) && (
          <AdditionalBlockers
            unit={code}
            reasons={otherReasons}
            records={others}
            open={onAction ? openBlocker : undefined}
          />
        )}
      </td>
      <td>
        {principal
          ? `${showDate(principal.start_date)} al ${showDate(principal.end_date)}`
          : "—"}
      </td>
      <td>
        {onAction && item.unit_id !== null && (
          <div className="compact-actions">
            {item.state === "available" && canWrite && (
              <>
                <button
                  className="secondary"
                  onClick={() => onAction({ kind: "reserve", preset })}
                >
                  Reservar cuarto <span className="sr-only">{code}</span>
                </button>
                <button
                  className="secondary"
                  onClick={() => onAction({ kind: "createContract", preset })}
                >
                  Crear contrato <span className="sr-only">{code}</span>
                </button>
              </>
            )}
            {principal && (
              <button
                className="secondary"
                onClick={() => openBlocker(principal)}
              >
                {principal.kind === "contract" ? "Ver contrato" : "Ver reserva"}{" "}
                {principal.id}
              </button>
            )}
            {(item.state === "maintenance" || item.state === "disabled") && (
              <button
                className="secondary"
                onClick={() =>
                  onAction({ kind: "unit", propertyId, id: item.unit_id! })
                }
              >
                Ver detalle del cuarto <span className="sr-only">{code}</span>
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function AdditionalBlockers({
  unit,
  reasons,
  records,
  open,
}: {
  unit: string;
  reasons: string[];
  records: AvailabilityBlocker[];
  open?: (record: AvailabilityBlocker) => void;
}) {
  const blockers = useLocalList(records, (record) => record.reason);
  return (
    <details>
      <summary>Otros impedimentos ({reasons.length + records.length})</summary>
      {reasons.length > 0 && (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {records.length > 0 && (
        <>
          <ListSearch
            label={`Buscar impedimentos de ${unit}`}
            {...blockers.search}
          />
          <ul>
            {blockers.rows.map((record) => (
              <li key={`${record.kind}-${record.id}`}>
                {record.reason}{" "}
                {open && (
                  <button className="secondary" onClick={() => open(record)}>
                    {record.kind === "contract"
                      ? "Ver contrato"
                      : "Ver reserva"}{" "}
                    {record.id}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ListPagination
            label={`impedimentos de ${unit}`}
            {...blockers.pagination}
          />
        </>
      )}
    </details>
  );
}

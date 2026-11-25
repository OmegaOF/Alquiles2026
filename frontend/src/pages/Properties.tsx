import { useEffect, useRef, useState } from "react";
import type { Person, Property, Unit, User } from "../types";
import { api } from "../api";
import {
  SearchSelect,
  personOption,
  propertyOption,
} from "../components/SearchSelect";
import { ContextDialog } from "../components/ContextDialog";
import { PersonForm } from "./People";
import { useRegistrySearch } from "../components/registrySearch";
import type { Availability } from "../tenancy";
import {
  AvailabilitySummary,
  PropertyStatus,
  WholePropertyAvailability,
} from "../components/PropertyStatus";
import {
  ListPagination,
  ListSearch,
  lastPage,
  useListRequest,
  useLocalList,
  useListPreference,
  RecordField,
  RecordRow,
} from "../components/RecordList";
import {
  Field,
  ErrorMessage,
  FormActions,
  value,
  errorText,
  markFormChanged,
} from "../components/Form";

type Props = {
  rooms?: boolean;
  initialRoom?: { propertyId: number; id: number };
  properties: Property[];
  people: Person[];
  users: User[];
  user: User;
  refresh: () => Promise<void>;
  onHouseAction?: (
    section: "contracts" | "availability" | "utilities" | "finances",
    propertyId: number,
  ) => void;
};
export function Properties({
  rooms = false,
  initialRoom,
  properties,
  people,
  users,
  user,
  refresh,
  onHouseAction,
}: Props) {
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newHouses, setNewHouses] = useState<Property[]>([]);
  const [selected, setSelected] = useListPreference<number | null>(
    rooms && !initialRoom ? "inventory:house" : undefined,
    initialRoom?.propertyId ?? null,
  );
  const [editing, setEditing] = useState<Partial<Property> | null>(null);
  const [notice, setNotice] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const general = user.role === "general_admin";
  const canEdit = general || user.role === "property_admin";
  const houses = [
    ...properties,
    ...newHouses.filter(
      (house) => !properties.some((item) => item.id === house.id),
    ),
  ];
  const findProperties = useRegistrySearch("properties", houses.length);
  const property = houses.find((p) => p.id === selected);
  const [houseState, setHouseState] = useListPreference("houses:state", "");
  const listing = useLocalList(
    houses.filter(
      (house) => !houseState || house.is_active === (houseState === "enabled"),
    ),
    (house) =>
      `${propertyOption(house).label} ${house.id} ${house.is_active ? "Habilitada" : "Deshabilitada"}`,
    "houses",
  );
  const [unitTarget, setUnitTarget] = useState(initialRoom?.id);
  if (editing)
    return (
      <PropertyForm
        property={editing}
        people={people}
        users={users}
        general={general}
        onCancel={() => setEditing(null)}
        onSaved={async (house) => {
          await refresh();
          setEditing(null);
          setSelected(house.id);
          setNotice("La propiedad se guardó correctamente.");
        }}
      />
    );
  if (rooms)
    return (
      <section>
        <div className="page-heading">
          <h1>Cuartos</h1>
          {!creatingRoom && (canEdit || user.role === "operator") && (
            <button
              onClick={() => {
                setCreatingRoom(true);
                setNotice("");
              }}
            >
              Registrar cuarto
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="success-message">
            {notice}
          </p>
        )}
        {creatingRoom ? (
          <RoomForm
            initial={{}}
            properties={houses}
            house={property}
            onCancel={() => setCreatingRoom(false)}
            onSaved={(houseId) => {
              setSelected(houseId);
              setCreatingRoom(false);
              setNotice("El cuarto o unidad se guardó correctamente.");
            }}
            createHouse={
              general
                ? {
                    people,
                    users,
                    onCreated: (house) => {
                      setNewHouses((current) => [...current, house]);
                      void refresh().catch(() => {});
                    },
                  }
                : undefined
            }
          />
        ) : (
          <>
            <SearchSelect
              label="Casa de los cuartos"
              placeholder="Buscar por nombre, dirección o ID"
              options={houses.map(propertyOption)}
              load={findProperties}
              value={selected ?? ""}
              onChange={(id) => {
                setUnitTarget(undefined);
                setSelected(Number(id) || null);
              }}
            />
            {property ? (
              <Units
                key={property.id}
                property={property}
                initialUnitId={unitTarget}
                canEdit={canEdit || user.role === "operator"}
                canCreate={false}
              />
            ) : (
              <p>Selecciona una casa para consultar sus cuartos.</p>
            )}
          </>
        )}
      </section>
    );
  if (property)
    return (
      <section>
        <button
          className="text-button"
          onClick={() => {
            setSelected(null);
            setNotice("");
          }}
        >
          ← Volver a propiedades
        </button>
        <div className="page-heading">
          <div>
            <p className="eyebrow">DETALLE DE LA PROPIEDAD</p>
            <h1>{property.name}</h1>
            <p>
              {property.address} · {property.zone} · {property.city}
            </p>
            <HouseStatus property={property} />
          </div>
          {canEdit && (
            <button onClick={() => setEditing(property)}>
              Editar propiedad
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="success-message">
            {notice}
          </p>
        )}
        <div className="panel details">
          <h2>Datos de la propiedad</h2>
          <p>{property.description || "Sin descripción adicional."}</p>
          <PropertyPeople
            property={property}
            people={people}
            users={users}
            general={general}
          />
        </div>
        {onHouseAction && (
          <div className="actions">
            <button
              className="secondary"
              onClick={() => onHouseAction("availability", property.id)}
            >
              Consultar disponibilidad
            </button>
            <button
              className="secondary"
              onClick={() => onHouseAction("contracts", property.id)}
            >
              Ver contratos de la casa
            </button>
            <button
              className="secondary"
              onClick={() => onHouseAction("utilities", property.id)}
            >
              Ver servicios de la casa
            </button>
            <button
              className="secondary"
              onClick={() => onHouseAction("finances", property.id)}
            >
              Ver cobros de la casa
            </button>
          </div>
        )}
        <PropertyAvailability
          propertyId={property.id}
          version={availabilityVersion}
        />
        <Units
          property={property}
          onChanged={() => setAvailabilityVersion((v) => v + 1)}
          canEdit={
            general ||
            user.role === "property_admin" ||
            user.role === "operator"
          }
        />
      </section>
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU ESPACIO DE ADMINISTRACIÓN</p>
          <h1>Mis casas</h1>
        </div>
        {general && (
          <button
            onClick={() => {
              setEditing({});
              setNotice("");
            }}
          >
            Registrar propiedad
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      <div className="record-filters">
        <ListSearch
          label="Buscar casas"
          placeholder="Nombre, dirección o zona"
          {...listing.search}
        />
        <Field label="Estado de la casa">
          <select
            value={houseState}
            onChange={(event) => {
              setHouseState(event.target.value);
              listing.pagination.onPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="enabled">Habilitadas</option>
            <option value="disabled">Deshabilitadas</option>
          </select>
        </Field>
      </div>
      {!houses.length ? (
        <div className="empty">
          Todavía no hay propiedades para mostrar.
          {general
            ? " Puedes registrar a un propietario al crear la casa."
            : "Solicita al administrador general que te asigne una propiedad."}
        </div>
      ) : listing.rows.length === 0 ? (
        <p role="status">No se encontraron casas.</p>
      ) : (
        <div className="record-rows">
          {listing.rows.map((p) => (
            <RecordRow
              key={p.id}
              title={p.name}
              fields={
                <>
                  <RecordField label="Dirección">
                    {[p.address, p.zone, p.city].filter(Boolean).join(" · ")}
                  </RecordField>
                  <RecordField label="Propietarios">
                    {p.owners.length}
                  </RecordField>
                  <RecordField label="Estado">
                    <HouseStatus property={p} />
                  </RecordField>
                </>
              }
              actions={
                <button
                  className="secondary"
                  onClick={() => {
                    setSelected(p.id);
                    setNotice("");
                  }}
                >
                  Ver propiedad <span className="sr-only">{p.name}</span>
                </button>
              }
            />
          ))}
        </div>
      )}
      <ListPagination label="casas" {...listing.pagination} />
    </section>
  );
}

function HouseStatus({ property }: { property: Property }) {
  return (
    <PropertyStatus
      state={property.is_active ? "enabled" : "disabled"}
      label={property.is_active ? "Habilitada" : "Deshabilitada"}
    />
  );
}

const managerExplanation =
  "Asigna administradores de propiedades a casas específicas.";
const noManagers =
  "No hay administradores adicionales asignados. El administrador general conserva acceso a esta propiedad.";

function PropertyPeople({
  property,
  people,
  users,
  general,
}: {
  property: Property;
  people: Person[];
  users: User[];
  general: boolean;
}) {
  const owners = useLocalList(
    property.owners.map((owner) => ({
      ...owner,
      name:
        people.find((person) => person.id === owner.person_id)?.full_name ??
        `Persona ${owner.person_id}`,
    })),
    (owner) => owner.name,
    `house:${property.id}:owners`,
  );
  const managers = useLocalList(
    property.manager_ids.map((id) => ({
      id,
      name: users.find((user) => user.id === id)?.full_name ?? `Usuario ${id}`,
    })),
    (manager) => manager.name,
    `house:${property.id}:managers`,
  );
  return (
    <>
      <h3>Propietarios</h3>
      <ListSearch label="Buscar propietarios" {...owners.search} />
      {owners.rows.length ? (
        <ul>
          {owners.rows.map((owner) => (
            <li key={owner.person_id}>
              {owner.name} ·{" "}
              {owner.share != null
                ? `${owner.share}% de participación`
                : "Participación no especificada"}
            </li>
          ))}
        </ul>
      ) : (
        <p>No se encontraron propietarios.</p>
      )}
      <ListPagination label="propietarios de la casa" {...owners.pagination} />
      {general && (
        <>
          <h3>Administradores autorizados</h3>
          <p>{managerExplanation}</p>
          {property.manager_ids.length ? (
            <>
              <ListSearch
                label="Buscar administradores asignados"
                {...managers.search}
              />
              {managers.rows.length ? (
                <ul>
                  {managers.rows.map((manager) => (
                    <li key={manager.id}>{manager.name}</li>
                  ))}
                </ul>
              ) : (
                <p>No se encontraron administradores.</p>
              )}
              <ListPagination
                label="administradores de la casa"
                {...managers.pagination}
              />
            </>
          ) : (
            <p>{noManagers}</p>
          )}
        </>
      )}
    </>
  );
}

function PropertyAvailability({
  propertyId,
  version,
}: {
  propertyId: number;
  version: number;
}) {
  const [query, setQuery] = useListPreference(
    `house:${propertyId}:today:query`,
    "",
  );
  const [page, setPage] = useListPreference(
    `house:${propertyId}:today:page`,
    1,
  );
  const params = new URLSearchParams({ page: String(page), q: query });
  const { data, previousData, loading, error, reload } =
    useListRequest<Availability>(
      `/properties/${propertyId}/availability?${params}`,
      150,
      version,
    );
  useEffect(() => {
    if (data && page > lastPage(data.total)) setPage(lastPage(data.total));
  }, [data, page]);
  const meta = data ?? previousData;
  return (
    <section className="panel">
      <h2>Disponibilidad de hoy</h2>
      {meta?.summary && (
        <>
          <AvailabilitySummary summary={meta.summary} />
          <WholePropertyAvailability whole={meta.whole} />
        </>
      )}
      <ListSearch
        label="Buscar en disponibilidad de hoy"
        placeholder="Código o nombre"
        value={query}
        onChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
      />
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary" onClick={reload}>
          Volver a consultar disponibilidad
        </button>
      )}
      {loading && <p role="status">Consultando disponibilidad…</p>}
      {data?.summary && (
        <>
          {data.units.length ? (
            <ul
              className="room-status-grid"
              aria-label="Disponibilidad de los cuartos hoy"
            >
              {data.units.map((unit) => (
                <li key={unit.unit_id}>
                  <strong title={unit.name}>{unit.code ?? unit.label}</strong>
                  <PropertyStatus state={unit.state} />
                </li>
              ))}
            </ul>
          ) : (
            <p>No se encontraron cuartos.</p>
          )}
        </>
      )}
      {meta?.summary && (
        <ListPagination
          label="cuartos de hoy"
          total={meta.total}
          page={Math.min(page, lastPage(meta.total))}
          onPage={setPage}
        />
      )}
    </section>
  );
}

export function PropertyForm({
  property,
  people,
  users,
  general,
  onCancel,
  onSaved,
}: {
  property: Partial<Property>;
  people: Person[];
  users: User[];
  general: boolean;
  onCancel: () => void;
  onSaved: (property: Property) => Promise<void>;
}) {
  const [addingOwner, setAddingOwner] = useState<number | null>(null);
  const [newOwners, setNewOwners] = useState<Person[]>([]);
  const availableOwners = [
    ...people,
    ...newOwners.filter(
      (person) => !people.some((item) => item.id === person.id),
    ),
  ].filter((person) => person.is_owner);
  const findOwners = useRegistrySearch("owners", availableOwners.length);
  const form = useRef<HTMLFormElement>(null);
  const [owners, setOwners] = useState(
    property.owners || [{ person_id: 0, share: null }],
  );
  const [managers, setManagers] = useState<number[]>(
    property.manager_ids || [],
  );
  const managerCandidates = useLocalList(
    users.filter(
      (user) =>
        user.role === "property_admin" &&
        (user.is_active || managers.includes(user.id)),
    ),
    (user) => `${user.full_name} ${user.username} ${user.display_name ?? ""}`,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (general && (!owners.length || owners.some((o) => !o.person_id))) {
      setError("Selecciona al menos un propietario para la propiedad.");
      return;
    }
    if (new Set(owners.map((o) => o.person_id)).size !== owners.length) {
      setError("Una persona solo puede aparecer una vez como propietaria.");
      return;
    }
    const data = new FormData(event.currentTarget);
    if (
      !window.confirm(
        "¿Guardar los datos de la propiedad? Revisa sus propietarios, permisos y estado antes de continuar.",
      )
    )
      return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: value(data, "name"),
        address: value(data, "address"),
        zone: value(data, "zone"),
        city: value(data, "city"),
        description: value(data, "description"),
      };
      if (general) {
        body.is_active = data.has("is_active");
        body.owners = owners;
        body.manager_ids = managers;
      }
      const result = await api<Property>(
        `/properties${property.id ? `/${property.id}` : ""}`,
        property.id ? "PATCH" : "POST",
        body,
      );
      await onSaved(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h1>{property.id ? "Editar propiedad" : "Registrar propiedad"}</h1>
      <p>
        Completa los datos de la casa o inmueble. Los campos con “opcional”
        pueden dejarse vacíos.
      </p>
      <ErrorMessage message={error} />
      <form
        ref={form}
        onSubmit={save}
        data-guard-changes
        onChange={markFormChanged}
      >
        <div className="form-grid">
          <Field label="Nombre de la propiedad">
            <input
              name="name"
              defaultValue={property.name}
              maxLength={160}
              required
            />
          </Field>
          <Field label="Dirección">
            <input
              name="address"
              defaultValue={property.address || ""}
              maxLength={300}
              required
            />
          </Field>
          <Field label="Zona (opcional)">
            <input
              name="zone"
              defaultValue={property.zone || ""}
              maxLength={120}
            />
          </Field>
          <Field label="Ciudad">
            <input
              name="city"
              defaultValue={property.city}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              name="description"
              defaultValue={property.description || ""}
              maxLength={2000}
            />
          </Field>
          <div>
            {general ? (
              <label className="check">
                <input
                  name="is_active"
                  type="checkbox"
                  defaultChecked={property.is_active ?? true}
                />
                Propiedad habilitada
              </label>
            ) : (
              <p>
                Estado: {property.is_active ? "Habilitada" : "Deshabilitada"}.
                Solo el administrador general puede cambiarlo.
              </p>
            )}
          </div>
        </div>
        {general && (
          <>
            <fieldset>
              <legend>Propietarios y participación</legend>
              <p>
                La participación es opcional. Si la indicas, el total no puede
                superar el 100%.
              </p>
              {owners.map((owner, index) => (
                <div className="owner-row" key={index}>
                  <div>
                    <SearchSelect
                      label={`Propietario ${index + 1}`}
                      placeholder="Buscar por nombre, documento o teléfono"
                      options={availableOwners.map(personOption)}
                      load={findOwners}
                      required
                      value={owner.person_id || ""}
                      onChange={(id) =>
                        setOwners(
                          owners.map((item, i) =>
                            index === i
                              ? { ...item, person_id: Number(id) }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setAddingOwner(index)}
                    >
                      + Registrar propietario
                    </button>
                  </div>
                  <Field label={`Participación ${index + 1} (%) · opcional`}>
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={owner.share ?? ""}
                      onChange={(e) =>
                        setOwners(
                          owners.map((o, i) =>
                            i === index
                              ? {
                                  ...o,
                                  share:
                                    e.target.value === ""
                                      ? null
                                      : e.target.value,
                                }
                              : o,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="secondary"
                    disabled={owners.length === 1}
                    onClick={() => {
                      if (form.current) form.current.dataset.dirty = "true";
                      setOwners(owners.filter((_, i) => i !== index));
                    }}
                  >
                    Quitar{" "}
                    <span className="sr-only">propietario {index + 1}</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (form.current) form.current.dataset.dirty = "true";
                  setOwners([...owners, { person_id: 0, share: null }]);
                }}
              >
                Añadir otro propietario
              </button>
            </fieldset>
            <fieldset>
              <legend>Administradores autorizados</legend>
              <p>
                {managerExplanation} Podrán consultar y editar esta propiedad y
                sus cuartos.
              </p>
              {!managers.length && <p>{noManagers}</p>}
              <ListSearch
                label="Buscar administradores de propiedades"
                {...managerCandidates.search}
              />
              {managerCandidates.rows.map((u) => (
                <label key={u.id} className="check">
                  <input
                    type="checkbox"
                    checked={managers.includes(u.id)}
                    disabled={!u.is_active && !managers.includes(u.id)}
                    onChange={(e) =>
                      setManagers(
                        e.target.checked
                          ? [...managers, u.id]
                          : managers.filter((id) => id !== u.id),
                      )
                    }
                  />
                  {u.full_name}
                  {!u.is_active &&
                    " · Cuenta deshabilitada; quitar la autorización antes de guardar"}
                </label>
              ))}
              <ListPagination
                label="administradores disponibles"
                {...managerCandidates.pagination}
              />
              {!users.some(
                (u) => u.role === "property_admin" && u.is_active,
              ) && (
                <p className="muted">
                  No hay administradores de propiedades activos. Puedes crearlos
                  en “Usuarios y permisos”.
                </p>
              )}
            </fieldset>
          </>
        )}
        <p className="muted">
          Deshabilitar conserva la propiedad y su historial. La ocupación se
          consulta en Contratos y Disponibilidad.
        </p>
        <FormActions saving={saving} onCancel={onCancel} />
      </form>
      {addingOwner !== null && (
        <ContextDialog
          label="Registrar propietario"
          onCancel={() => setAddingOwner(null)}
        >
          <PersonForm
            person={{}}
            asOwner
            onCancel={() => setAddingOwner(null)}
            onSaved={async (person) => {
              if (form.current) form.current.dataset.dirty = "true";
              setNewOwners((current) => [...current, person]);
              setOwners((current) =>
                current.map((owner, index) =>
                  index === addingOwner
                    ? { ...owner, person_id: person.id }
                    : owner,
                ),
              );
              setAddingOwner(null);
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

type Inventory = {
  items: (Unit & { occupied_today: boolean })[];
  total: number;
  types: string[];
};
const unitTypes: Record<string, string> = {
  cuarto: "Cuarto",
  departamento: "Departamento",
  local: "Local",
  otro: "Otro",
};

function Units({
  property,
  canEdit,
  canCreate = true,
  initialUnitId,
  onChanged,
}: {
  property: Property;
  canEdit: boolean;
  canCreate?: boolean;
  initialUnitId?: number;
  onChanged?: () => void;
}) {
  const [selected, setSelected] = useState<Unit>();
  const [target, setTarget] = useState(initialUnitId);
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useListPreference(
    `house:${property.id}:rooms:filters`,
    {
      q: "",
      unit_type: "",
      enabled: "",
      maintenance: "",
    },
  );
  const [page, setPage] = useListPreference(
    `house:${property.id}:rooms:page`,
    1,
  );
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const base = `/properties/${property.id}`;
  const inventory = useListRequest<Inventory>(
    !target && !selected && !editing
      ? `${base}/unit-inventory?${params}`
      : null,
    150,
  );
  const detail = useListRequest<Unit>(
    target ? `${base}/units/${target}` : null,
  );
  const unit = selected ?? detail.data;
  const listMeta = inventory.data ?? inventory.previousData;
  useEffect(() => {
    if (inventory.data && page > lastPage(inventory.data.total))
      setPage(lastPage(inventory.data.total));
  }, [inventory.data, page]);
  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  function closeDetail() {
    setTarget(undefined);
    setSelected(undefined);
  }
  if (editing) {
    return (
      <RoomForm
        initial={editing}
        house={property}
        fixedHouse
        properties={[property]}
        onCancel={() => setEditing(null)}
        onSaved={(_, saved) => {
          if (unit) {
            setSelected(saved);
            setTarget(undefined);
          }
          setEditing(null);
          setNotice("El cuarto o unidad se guardó correctamente.");
          inventory.reload();
          onChanged?.();
        }}
      />
    );
  }
  if (unit || target) {
    return (
      <section className="panel">
        <button className="text-button" onClick={closeDetail}>
          ← Volver a cuartos y unidades
        </button>
        {notice && (
          <p role="status" className="success-message">
            {notice}
          </p>
        )}
        {detail.loading && <p role="status">Cargando cuarto…</p>}
        <ErrorMessage message={detail.error} />
        {detail.error && (
          <button className="secondary" onClick={detail.reload}>
            Reintentar carga del cuarto
          </button>
        )}
        {unit && (
          <>
            <div className="page-heading">
              <h2>
                {unit.code} · {unit.name}
              </h2>
              {canEdit && (
                <button className="secondary" onClick={() => setEditing(unit)}>
                  Editar cuarto
                </button>
              )}
            </div>
            <dl>
              <dt>Tipo de unidad</dt>
              <dd>{unitTypes[unit.unit_type] ?? unit.unit_type}</dd>
              <dt>Habilitación</dt>
              <dd>
                <PropertyStatus
                  state={unit.is_enabled ? "enabled" : "disabled"}
                />
              </dd>
              <dt>Mantenimiento</dt>
              <dd>
                <PropertyStatus
                  state={unit.maintenance ? "maintenance" : "noMaintenance"}
                />
              </dd>
              <dt>Descripción</dt>
              <dd>{unit.description || "Sin descripción."}</dd>
              <dt>Observaciones</dt>
              <dd>{unit.notes || "Sin observaciones."}</dd>
            </dl>
          </>
        )}
      </section>
    );
  }
  return (
    <section className="units-section">
      <div className="page-heading">
        <h2>Cuartos y unidades</h2>
        {canEdit && canCreate && (
          <button
            onClick={() => {
              setEditing({});
              setNotice("");
            }}
          >
            Registrar cuarto
          </button>
        )}
      </div>
      <div className="inventory-filters">
        <ListSearch
          label="Buscar cuartos"
          placeholder="Código o nombre"
          value={filters.q}
          onChange={(value) => updateFilter("q", value)}
        />
        <Field label="Tipo de unidad">
          <select
            value={filters.unit_type}
            onChange={(event) => updateFilter("unit_type", event.target.value)}
          >
            <option value="">Todos los tipos</option>
            {listMeta?.types.map((type) => (
              <option key={type} value={type}>
                {unitTypes[type] ?? type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Habilitación">
          <select
            value={filters.enabled}
            onChange={(event) => updateFilter("enabled", event.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="true">Habilitado</option>
            <option value="false">Deshabilitado</option>
          </select>
        </Field>
        <Field label="Mantenimiento">
          <select
            value={filters.maintenance}
            onChange={(event) =>
              updateFilter("maintenance", event.target.value)
            }
          >
            <option value="">Todas las unidades</option>
            <option value="true">En mantenimiento</option>
            <option value="false">Sin mantenimiento marcado</option>
          </select>
        </Field>
      </div>
      <ErrorMessage message={inventory.error} />
      {inventory.error && (
        <button className="secondary" onClick={inventory.reload}>
          Reintentar carga de cuartos
        </button>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {inventory.loading && <p role="status">Cargando cuartos…</p>}
      {inventory.data &&
        (inventory.data.items.length ? (
          <div
            className="table-scroll compact-table"
            role="region"
            aria-label="Inventario de cuartos y unidades"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Inventario de cuartos y unidades
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cuarto o unidad</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Habilitación</th>
                  <th scope="col">Mantenimiento</th>
                  <th scope="col">Ocupación de hoy</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventory.data.items.map((unit) => (
                  <tr key={unit.id}>
                    <th scope="row">
                      <strong>{unit.code}</strong>
                      <br />
                      {unit.name}
                    </th>
                    <td>{unitTypes[unit.unit_type] ?? unit.unit_type}</td>
                    <td>
                      <PropertyStatus
                        state={unit.is_enabled ? "enabled" : "disabled"}
                      />
                    </td>
                    <td>
                      <PropertyStatus
                        state={
                          unit.maintenance ? "maintenance" : "noMaintenance"
                        }
                      />
                    </td>
                    <td>
                      <PropertyStatus
                        state={unit.occupied_today ? "occupied" : "unoccupied"}
                      />
                    </td>
                    <td>
                      <div className="compact-actions">
                        <button
                          className="secondary"
                          onClick={() => setSelected(unit)}
                        >
                          Ver detalle{" "}
                          <span className="sr-only">{unit.code}</span>
                        </button>
                        {canEdit && (
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditing(unit);
                              setNotice("");
                            }}
                          >
                            Editar cuarto{" "}
                            <span className="sr-only">{unit.code}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No se encontraron cuartos.</p>
        ))}
      {listMeta && (
        <ListPagination
          label="inventario"
          total={listMeta.total}
          page={Math.min(page, lastPage(listMeta.total))}
          onPage={setPage}
        />
      )}
    </section>
  );
}

export function RoomForm({
  house,
  fixedHouse = false,
  properties,
  initial,
  onSaved,
  onCancel,
  createHouse,
}: {
  house?: Property;
  fixedHouse?: boolean;
  properties: Property[];
  initial: Partial<Unit>;
  onSaved: (houseId: number, unit: Unit) => void;
  onCancel: () => void;
  createHouse?: {
    people: Person[];
    users: User[];
    onCreated: (property: Property) => void;
  };
}) {
  const fixed = fixedHouse ? house : undefined;
  const [propertyId, setPropertyId] = useState(house?.id ?? 0);
  const property = properties.find((item) => item.id === propertyId);
  const findProperties = useRegistrySearch("properties", properties.length);
  const [addingHouse, setAddingHouse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!property || saving) return;
    const data = new FormData(event.currentTarget);
    if (
      !window.confirm(
        "¿Guardar los datos y el estado de habilitación de este cuarto o unidad?",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const room = await api<Unit>(
        `/properties/${property.id}/units${initial.id ? `/${initial.id}` : ""}`,
        initial.id ? "PATCH" : "POST",
        {
          code: value(data, "code"),
          name: value(data, "name"),
          unit_type: value(data, "unit_type"),
          description: value(data, "description"),
          maintenance: data.has("maintenance"),
          is_enabled: data.has("is_enabled"),
          notes: value(data, "notes"),
        },
      );
      onSaved(property.id, room);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h2>
        {initial.id ? "Editar cuarto o unidad" : "Registrar cuarto o unidad"}
      </h2>
      {fixed && (
        <p>
          <strong>Casa</strong> · {fixed.name}
        </p>
      )}
      <ErrorMessage message={error} />
      <form
        ref={form}
        onSubmit={save}
        data-guard-changes
        onChange={markFormChanged}
      >
        {!fixed && (
          <>
            <SearchSelect
              label="¿A qué casa pertenece?"
              required
              options={properties.map(propertyOption)}
              load={findProperties}
              value={propertyId || ""}
              onChange={(id) => setPropertyId(Number(id))}
              placeholder="Buscar por nombre, dirección o ID"
            />
            {createHouse && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAddingHouse(true)}
              >
                + Registrar casa
              </button>
            )}
          </>
        )}
        <div className="form-grid">
          <Field label="Número o identificador">
            <input
              name="code"
              defaultValue={initial.code}
              maxLength={50}
              required
            />
          </Field>
          <Field label="Nombre del cuarto o unidad">
            <input
              name="name"
              defaultValue={initial.name}
              maxLength={160}
              required
            />
          </Field>
          <Field label="Tipo de unidad">
            <select
              name="unit_type"
              defaultValue={initial.unit_type || "cuarto"}
            >
              {initial.unit_type && !(initial.unit_type in unitTypes) && (
                <option value={initial.unit_type}>{initial.unit_type}</option>
              )}
              <option value="cuarto">Cuarto</option>
              <option value="departamento">Departamento</option>
              <option value="local">Local</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              name="description"
              defaultValue={initial.description || ""}
              maxLength={2000}
            />
          </Field>
          <label className="check">
            <input
              name="is_enabled"
              type="checkbox"
              defaultChecked={initial.is_enabled ?? true}
            />
            Unidad habilitada
          </label>
          <label className="check">
            <input
              name="maintenance"
              type="checkbox"
              defaultChecked={initial.maintenance ?? false}
            />
            En mantenimiento
          </label>
          <Field label="Observaciones (opcional)">
            <textarea
              name="notes"
              defaultValue={initial.notes || ""}
              maxLength={2000}
            />
          </Field>
        </div>
        <p className="muted">
          Usa un número o código visible único en la casa. La disponibilidad
          combina estos estados con los contratos y las reservas.
        </p>
        <FormActions saving={saving} onCancel={onCancel} />
      </form>
      {addingHouse && createHouse && (
        <ContextDialog
          label="Registrar casa"
          onCancel={() => setAddingHouse(false)}
        >
          <PropertyForm
            property={{}}
            people={createHouse.people}
            users={createHouse.users}
            general
            onCancel={() => setAddingHouse(false)}
            onSaved={async (house) => {
              if (form.current) form.current.dataset.dirty = "true";
              createHouse.onCreated(house);
              setPropertyId(house.id);
              setAddingHouse(false);
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Person, Property, Unit, User } from "../types";
import { api } from "../api";
import {
  SearchSelect,
  normalizeSearch,
  personOption,
  propertyOption,
} from "../components/SearchSelect";
import { ContextDialog } from "../components/ContextDialog";
import { PersonForm } from "./People";
import { useRegistrySearch } from "../components/registrySearch";
import { stateNames } from "../tenancy";
import type { Availability } from "../tenancy";
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
  properties,
  people,
  users,
  user,
  refresh,
  onHouseAction,
}: Props) {
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newHouses, setNewHouses] = useState<Property[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
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
  const matchingHouses = properties.filter((house) =>
    normalizeSearch(`${propertyOption(house).label} ${house.id}`).includes(
      normalizeSearch(query),
    ),
  );
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
              onChange={(id) => setSelected(Number(id) || null)}
            />
            {property ? (
              <Units
                key={property.id}
                property={property}
                onChanged={() => {}}
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
            <span className="badge">
              {property.is_active ? "Habilitada" : "Deshabilitada"}
            </span>
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
          <h3>Propietarios</h3>
          <ul>
            {property.owners.map((owner) => (
              <li key={owner.person_id}>
                {people.find((p) => p.id === owner.person_id)?.full_name ||
                  `Persona ${owner.person_id}`}
                {owner.share != null
                  ? ` · ${owner.share}% de participación`
                  : " · Participación no especificada"}
              </li>
            ))}
          </ul>
          {general && (
            <>
              <h3>Administradores autorizados</h3>
              <p>
                {property.manager_ids.length
                  ? property.manager_ids
                      .map(
                        (id) =>
                          users.find((u) => u.id === id)?.full_name ||
                          `Usuario ${id}`,
                      )
                      .join(", ")
                  : "Sin administradores asignados."}
              </p>
            </>
          )}
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
          <h1>Propiedades</h1>
          <p className="muted">
            Consulta las casas y unidades que tienes autorizadas.
          </p>
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
      <Field label="Buscar casas">
        <input
          type="search"
          value={query}
          placeholder="Nombre, dirección o zona"
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      {!properties.length ? (
        <div className="empty">
          Todavía no hay propiedades para mostrar.
          {general
            ? " Puedes registrar a un propietario al crear la casa."
            : "Solicita al administrador general que te asigne una propiedad."}
        </div>
      ) : matchingHouses.length === 0 ? (
        <p role="status">No se encontraron casas.</p>
      ) : (
        <div className="property-grid">
          {matchingHouses.map((p) => (
            <article key={p.id}>
              <span className="badge">
                {p.is_active ? "Habilitada" : "Deshabilitada"}
              </span>
              <h2>{p.name}</h2>
              <p>{p.address}</p>
              <p>{[p.zone, p.city].filter(Boolean).join(" · ")}</p>
              <p>
                {p.owners.length}{" "}
                {p.owners.length === 1 ? "propietario" : "propietarios"}
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setSelected(p.id);
                  setNotice("");
                }}
              >
                Ver propiedad <span className="sr-only">{p.name}</span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyAvailability({
  propertyId,
  version,
}: {
  propertyId: number;
  version: number;
}) {
  const requestId = useRef(0);
  const [data, setData] = useState<Availability | null>(null);
  const [error, setError] = useState("");
  async function load() {
    const request = ++requestId.current;
    setError("");
    try {
      const result = await api<Availability>(
        `/properties/${propertyId}/availability`,
      );
      if (request === requestId.current) setData(result);
    } catch (e) {
      if (request === requestId.current) setError(errorText(e));
    }
  }
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      requestId.current++;
    };
  }, [propertyId, version]);
  return (
    <section className="panel">
      <h2>Disponibilidad de hoy</h2>
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary" onClick={() => void load()}>
          Volver a consultar disponibilidad
        </button>
      )}
      {data?.whole && (
        <>
          <p>
            <strong>Casa completa: {stateNames[data.whole.state]}</strong>.{" "}
            {data.whole.reason}
          </p>
          <p>
            Cuartos disponibles:{" "}
            {data.units.filter((unit) => unit.state === "available").length} de{" "}
            {data.units.length}.
          </p>
          <ul>
            {data.units.map((unit) => (
              <li key={unit.unit_id}>
                {unit.label}: <strong>{stateNames[unit.state]}</strong>.{" "}
                {unit.reason}
              </li>
            ))}
          </ul>
          <p>Para otras fechas, abre “Disponibilidad”.</p>
        </>
      )}
      {!data && !error && <p role="status">Consultando disponibilidad…</p>}
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
              <p>Podrán consultar y editar esta propiedad y sus cuartos.</p>
              {users
                .filter(
                  (u) =>
                    u.role === "property_admin" &&
                    (u.is_active || managers.includes(u.id)),
                )
                .map((u) => (
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

function Units({
  property,
  canEdit,
  canCreate = true,
  onChanged,
}: {
  property: Property;
  canEdit: boolean;
  canCreate?: boolean;
  onChanged: () => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setUnits(await api<Unit[]>(`/properties/${property.id}/units`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [property.id]);
  if (editing)
    return (
      <RoomForm
        initial={editing}
        house={property}
        fixedHouse
        properties={[property]}
        onCancel={() => {
          setEditing(null);
          setError("");
        }}
        onSaved={() => {
          setEditing(null);
          setNotice("El cuarto o unidad se guardó correctamente.");
          void load();
          onChanged();
        }}
      />
    );
  return (
    <section className="units-section">
      <div className="page-heading">
        <div>
          <h2>Cuartos y unidades</h2>
          <p className="muted">Organiza los espacios de esta propiedad.</p>
        </div>
        {canEdit && canCreate && (
          <button
            onClick={() => {
              setEditing({});
              setError("");
              setNotice("");
            }}
          >
            Registrar cuarto
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {error && (
        <button className="secondary" onClick={() => void load()}>
          Reintentar carga de cuartos
        </button>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando cuartos…</p>
      ) : units.length ? (
        <div className="record-list">
          {units.map((unit) => (
            <article key={unit.id}>
              <div className="record-main">
                <h3>
                  {unit.code} · {unit.name}
                </h3>
                <p>
                  {unit.unit_type} ·{" "}
                  {unit.is_enabled ? "Habilitado" : "Deshabilitado"} ·{" "}
                  {unit.maintenance
                    ? "En mantenimiento"
                    : "Sin mantenimiento pendiente"}
                </p>
                {unit.description && <p>{unit.description}</p>}
                {unit.notes && <p>{unit.notes}</p>}
              </div>
              {canEdit && (
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(unit);
                    setError("");
                  }}
                >
                  Editar cuarto <span className="sr-only">{unit.code}</span>
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty">
            Todavía no hay cuartos registrados en esta propiedad.
          </div>
        )
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

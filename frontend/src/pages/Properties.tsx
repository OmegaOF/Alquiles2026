import { useEffect, useRef, useState } from "react";
import type { Person, Property, Unit, User } from "../types";
import { api } from "../api";
import { stateNames } from "../tenancy";
import type { Availability } from "../tenancy";
import {
  Field,
  ErrorMessage,
  FormActions,
  value,
  errorText,
} from "../components/Form";

type Props = {
  properties: Property[];
  people: Person[];
  users: User[];
  user: User;
  refresh: () => Promise<void>;
};
export function Properties({
  properties,
  people,
  users,
  user,
  refresh,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<Property> | null>(null);
  const [notice, setNotice] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const general = user.role === "general_admin";
  const canEdit = general || user.role === "property_admin";
  const property = properties.find((p) => p.id === selected);
  if (editing)
    return (
      <PropertyForm
        property={editing}
        people={people}
        users={users}
        general={general}
        onCancel={() => setEditing(null)}
        onSaved={async (id) => {
          await refresh();
          setEditing(null);
          setSelected(id);
          setNotice("La propiedad se guardó correctamente.");
        }}
      />
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
      {!properties.length ? (
        <div className="empty">
          Todavía no hay propiedades para mostrar.
          {general
            ? " Registra primero a sus propietarios y después crea la propiedad."
            : "Solicita al administrador general que te asigne una propiedad."}
        </div>
      ) : (
        <div className="property-grid">
          {properties.map((p) => (
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

function PropertyForm({
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
  onSaved: (id: number) => Promise<void>;
}) {
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
      await onSaved(result.id);
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
      <form onSubmit={save}>
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
              {!people.some((p) => p.is_owner) && (
                <p className="error-message">
                  Primero registra un propietario en “Personas”. Cancela este
                  formulario para hacerlo.
                </p>
              )}
              {owners.map((owner, index) => (
                <div className="owner-row" key={index}>
                  <Field label={`Propietario ${index + 1}`}>
                    <select
                      value={owner.person_id || ""}
                      required
                      onChange={(e) =>
                        setOwners(
                          owners.map((o, i) =>
                            i === index
                              ? { ...o, person_id: Number(e.target.value) }
                              : o,
                          ),
                        )
                      }
                    >
                      <option value="">Seleccionar persona</option>
                      {people
                        .filter((p) => p.is_owner)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                    </select>
                  </Field>
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
                    onClick={() =>
                      setOwners(owners.filter((_, i) => i !== index))
                    }
                  >
                    Quitar{" "}
                    <span className="sr-only">propietario {index + 1}</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setOwners([...owners, { person_id: 0, share: null }])
                }
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
    </section>
  );
}

function Units({
  property,
  canEdit,
  onChanged,
}: {
  property: Property;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      await api(
        `/properties/${property.id}/units${editing?.id ? `/${editing.id}` : ""}`,
        editing?.id ? "PATCH" : "POST",
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
      await load();
      onChanged();
      setEditing(null);
      setNotice("El cuarto o unidad se guardó correctamente.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  if (editing)
    return (
      <section className="panel">
        <h2>
          {editing.id ? "Editar cuarto o unidad" : "Registrar cuarto o unidad"}
        </h2>
        <p>
          Propiedad: {property.name}. El número debe ser único dentro de esta
          propiedad.
        </p>
        <ErrorMessage message={error} />
        <form onSubmit={save} key={editing.id || "new"}>
          <div className="form-grid">
            <Field label="Número o identificador">
              <input
                name="code"
                defaultValue={editing.code}
                maxLength={50}
                required
              />
            </Field>
            <Field label="Nombre del cuarto o unidad">
              <input
                name="name"
                defaultValue={editing.name}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Tipo de unidad">
              <select
                name="unit_type"
                defaultValue={editing.unit_type || "cuarto"}
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
                defaultValue={editing.description || ""}
                maxLength={2000}
              />
            </Field>
            <label className="check">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={editing.is_enabled ?? true}
              />
              Unidad habilitada
            </label>
            <label className="check">
              <input
                name="maintenance"
                type="checkbox"
                defaultChecked={editing.maintenance ?? false}
              />
              En mantenimiento
            </label>
            <Field label="Observaciones (opcional)">
              <textarea
                name="notes"
                defaultValue={editing.notes || ""}
                maxLength={2000}
              />
            </Field>
          </div>
          <p className="muted">
            La disponibilidad combina estos estados con los contratos y las
            reservas.
          </p>
          <FormActions
            saving={saving}
            onCancel={() => {
              setEditing(null);
              setError("");
            }}
          />
        </form>
      </section>
    );
  return (
    <section className="units-section">
      <div className="page-heading">
        <div>
          <h2>Cuartos y unidades</h2>
          <p className="muted">Organiza los espacios de esta propiedad.</p>
        </div>
        {canEdit && (
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

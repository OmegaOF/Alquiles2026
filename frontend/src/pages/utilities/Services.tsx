import { useState } from "react";
import { api } from "../../api";
import type { Person, Property, User } from "../../types";
import type {
  ConfigFields,
  ServiceAccount,
  UtilityType,
} from "../../utilities";
import { configFields, methods } from "../../utilities";
import { ConfigurationFields } from "./ConfigurationFields";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { localToday, showDate } from "../../tenancy";

type Props = {
  property: Property;
  user: User;
  accounts: ServiceAccount[];
  types: UtilityType[];
  people: Person[];
  units: { id: number; code: string; name: string }[];
  reload: () => Promise<void>;
};
export function Services(props: Props) {
  const { property, user, accounts, types, reload } = props;
  const [editing, setEditing] = useState<Partial<ServiceAccount> | null>(null),
    [configuring, setConfiguring] = useState<ServiceAccount | null>(null),
    [typesOpen, setTypesOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (editing)
    return (
      <ServiceForm
        {...props}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          await reload();
          setEditing(null);
        }}
      />
    );
  if (configuring)
    return (
      <ConfigForm
        {...props}
        account={configuring}
        onCancel={() => setConfiguring(null)}
        onSaved={async () => {
          await reload();
          setConfiguring(null);
        }}
      />
    );
  async function changeType(type: UtilityType) {
    if (
      !window.confirm(
        `¿${type.is_active ? "Desactivar" : "Activar"} este tipo de servicio?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/utility-types/${type.id}`, "PATCH", {
        name: type.name,
        is_active: !type.is_active,
      });
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function addType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await api("/utility-types", "POST", {
        name: String(new FormData(form).get("name")),
      });
      await reload();
      form.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>Servicios y suministros de {property.name}</h2>
          <p>
            Una casa puede tener varias cuentas del mismo servicio. El historial
            se conserva al deshabilitarlas.
          </p>
        </div>
        {user.role !== "owner" && (
          <button onClick={() => setEditing({})}>Registrar servicio</button>
        )}
      </div>
      <ErrorMessage message={error} />
      {user.role === "general_admin" && (
        <button className="secondary" onClick={() => setTypesOpen(!typesOpen)}>
          Tipos de servicios
        </button>
      )}
      {typesOpen && (
        <section className="panel">
          <h3>Tipos configurables</h3>
          <form onSubmit={addType}>
            <Field label="Nombre del nuevo tipo de servicio">
              <input name="name" minLength={2} maxLength={80} required />
            </Field>
            <button disabled={busy}>Guardar tipo de servicio</button>
          </form>
          <ul>
            {types.map((t) => (
              <li key={t.id}>
                {t.name} · {t.is_active ? "Activo" : "Inactivo"}{" "}
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() => void changeType(t)}
                >
                  {t.is_active ? "Desactivar" : "Activar"} {t.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="record-list">
        {accounts.map((a) => (
          <article key={a.id}>
            <div className="record-main">
              <h3>{a.label}</h3>
              <p>
                {a.type_name} · {a.provider} ·{" "}
                {a.is_active ? "Activo" : "Inactivo"}
              </p>
              <p>
                Cuenta: {a.account_number || "Sin número de suministro"} ·{" "}
                {a.measurement_kind === "shared" ? "Compartido" : "Individual"}{" "}
                · Desde {showDate(a.start_date)}
              </p>
              <p>
                Reparto: {methods[a.configuration.method]} ·{" "}
                {a.configuration.unit_ids.length
                  ? `${a.configuration.unit_ids.length} cuartos`
                  : "Casa completa"}
              </p>
              {a.measure_unit && <p>Unidad de medida: {a.measure_unit}</p>}
            </div>
            {user.role !== "owner" && (
              <div className="actions">
                <button className="secondary" onClick={() => setEditing(a)}>
                  Editar servicio {a.id}
                </button>
                <button
                  className="secondary"
                  disabled={!a.is_active}
                  onClick={() => setConfiguring(a)}
                >
                  Cambiar reparto {a.id}
                </button>
              </div>
            )}
          </article>
        ))}
        {!accounts.length && (
          <p className="empty">
            Todavía no hay servicios registrados en esta casa.
          </p>
        )}
      </div>
    </section>
  );
}

function ServiceForm({
  property,
  user,
  types,
  people,
  units,
  initial,
  onCancel,
  onSaved,
}: Props & {
  initial: Partial<ServiceAccount>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [config, setConfig] = useState<ConfigFields>({
    ...configFields(),
    unit_ids: units.map((u) => u.id),
    owner_person_id:
      property.owners.length === 1 ? property.owners[0].person_id : null,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        "¿Guardar este servicio y sus condiciones de reparto? Se conservará su historial.",
      )
    )
      return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const common = {
      type_id: Number(data.get("type_id")),
      label: String(data.get("label")),
      provider: String(data.get("provider")),
      account_number: String(data.get("account_number") || "") || null,
      measure_unit: String(data.get("measure_unit") || "") || null,
      notes: String(data.get("notes") || "") || null,
      is_active: data.has("is_active"),
    };
    try {
      await api(
        initial.id
          ? `/service-accounts/${initial.id}`
          : `/properties/${property.id}/service-accounts`,
        initial.id ? "PATCH" : "POST",
        initial.id
          ? { ...common, expected_version: initial.version }
          : {
              ...common,
              start_date: String(data.get("start_date")),
              measurement_kind: String(data.get("measurement_kind")),
              configuration: config,
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
      <h2>{initial.id ? "Editar servicio" : "Registrar servicio"}</h2>
      <p>Casa: {property.name}</p>
      <ErrorMessage message={error} />
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Tipo de servicio">
            <select
              name="type_id"
              required
              defaultValue={initial.type_id || ""}
            >
              <option value="">Seleccionar servicio</option>
              {types
                .filter((t) => t.is_active || t.id === initial.type_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Nombre para reconocer el suministro">
            <input
              name="label"
              defaultValue={initial.label}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>
          <Field label="Empresa proveedora">
            <input
              name="provider"
              defaultValue={initial.provider}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>
          <Field label="Número de cuenta o suministro (opcional)">
            <input
              name="account_number"
              defaultValue={initial.account_number || ""}
              maxLength={100}
            />
          </Field>
          <Field label="Unidad de medida (opcional, por ejemplo kWh o m³)">
            <input
              name="measure_unit"
              defaultValue={initial.measure_unit || ""}
              maxLength={30}
            />
          </Field>
          {!initial.id && (
            <>
              <Field label="Servicio individual o compartido">
                <select name="measurement_kind" defaultValue="shared">
                  <option value="shared">Compartido</option>
                  <option value="individual">Individual</option>
                </select>
              </Field>
              <Field label="Fecha de inicio del servicio">
                <input
                  name="start_date"
                  type="date"
                  defaultValue={localToday()}
                  required
                />
              </Field>
            </>
          )}
          <Field label="Observaciones del servicio (opcional)">
            <textarea
              name="notes"
              defaultValue={initial.notes || ""}
              maxLength={3000}
            />
          </Field>
          <label className="check">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={initial.is_active ?? true}
            />
            Servicio activo
          </label>
        </div>
        {!initial.id ? (
          <ConfigurationFields
            value={config}
            onChange={setConfig}
            units={units}
            people={people}
          />
        ) : (
          <p>
            Si ya hay lecturas o recibos, conserva proveedor, suministro, tipo y
            unidad de medida. Para cambiar la forma de reparto utiliza “Cambiar
            reparto”.
          </p>
        )}
        <div className="actions">
          <button disabled={busy}>
            {busy ? "Guardando…" : "Guardar servicio"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar registro
          </button>
        </div>
      </form>
    </section>
  );
}

function ConfigForm({
  account,
  people,
  units,
  onCancel,
  onSaved,
}: Props & {
  account: ServiceAccount;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(configFields(account.configuration)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "¿Guardar estas condiciones para próximos repartos? Los resultados confirmados conservarán sus condiciones anteriores.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/service-accounts/${account.id}/configurations`, "POST", {
        ...value,
        expected_version: account.version,
      });
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={save}>
      <h2>Cambiar reparto de {account.label}</h2>
      <ErrorMessage message={error} />
      <ConfigurationFields
        value={value}
        onChange={setValue}
        people={people}
        units={units}
      />
      <div className="actions">
        <button disabled={busy}>Guardar condiciones de reparto</button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Volver a servicios
        </button>
      </div>
    </form>
  );
}

import { useState } from "react";
import type { Person, Property, Role, User } from "../types";
import { roleNames } from "../types";
import { api } from "../api";
import {
  Field,
  ErrorMessage,
  FormActions,
  value,
  errorText,
} from "../components/Form";

export function Users({
  users,
  people,
  properties,
  currentUser,
  refresh,
}: {
  users: User[];
  people: Person[];
  properties: Property[];
  currentUser: User;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const [role, setRole] = useState<Role>("operator");
  const [assigned, setAssigned] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  function edit(user: Partial<User>) {
    setEditing(user);
    setRole(user.role || "operator");
    setAssigned(user.property_ids || []);
    setError("");
    setNotice("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    if (
      !window.confirm(
        "¿Guardar esta cuenta y sus permisos? La persona podrá acceder a la información autorizada.",
      )
    )
      return;
    const password = String(data.get("password") || "");
    const body: Record<string, unknown> = {
      username: value(data, "username"),
      full_name: value(data, "full_name"),
      role,
      person_id: value(data, "person_id")
        ? Number(value(data, "person_id"))
        : null,
      is_active: data.has("is_active"),
      property_ids:
        role === "operator" || role === "property_admin" ? assigned : [],
    };
    if (password) body.password = password;
    setSaving(true);
    try {
      await api(
        `/users${editing?.id ? `/${editing.id}` : ""}`,
        editing?.id ? "PATCH" : "POST",
        body,
      );
      await refresh();
      setEditing(null);
      setNotice("La cuenta y sus permisos se guardaron correctamente.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  if (editing)
    return (
      <section className="panel">
        <h1>{editing.id ? "Editar cuenta y permisos" : "Registrar usuario"}</h1>
        <p>
          Las cuentas permiten ingresar al sistema. No es necesario crear una
          cuenta para cada propietario.
        </p>
        <ErrorMessage message={error} />
        <form onSubmit={save} key={editing.id || "new"}>
          <div className="form-grid">
            <Field label="Nombre completo">
              <input
                name="full_name"
                defaultValue={editing.full_name}
                maxLength={160}
                required
                autoComplete="off"
              />
            </Field>
            <Field
              label="Nombre de usuario"
              hint="Usa un nombre fácil de recordar, sin espacios."
            >
              <input
                name="username"
                defaultValue={editing.username}
                required
                minLength={3}
                maxLength={80}
                autoComplete="off"
              />
            </Field>
            <Field
              label={editing.id ? "Nueva contraseña (opcional)" : "Contraseña"}
              hint={
                editing.id
                  ? "Deja vacío para conservar la contraseña actual. Si la cambias, usa al menos 12 caracteres."
                  : "Usa al menos 12 caracteres. No compartas esta contraseña con otras personas."
              }
            >
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required={!editing.id}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Rol de acceso">
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {Object.entries(roleNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={
                role === "owner"
                  ? "Propietario vinculado"
                  : "Persona vinculada (opcional)"
              }
              hint={
                role === "owner"
                  ? "El acceso se determina por las propiedades de esta persona."
                  : "Permite relacionar la cuenta con una persona registrada."
              }
            >
              <select
                name="person_id"
                defaultValue={editing.person_id || ""}
                required={role === "owner"}
              >
                <option value="">Seleccionar persona</option>
                {people
                  .filter((p) => role !== "owner" || p.is_owner)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="check">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={editing.is_active ?? true}
              />
              Cuenta habilitada
            </label>
          </div>
          <div className="permission-note">
            <h2>Qué permite este rol</h2>
            <p>
              {role === "general_admin"
                ? "Administra todas las propiedades, personas y cuentas de usuario."
                : role === "property_admin"
                  ? "Consulta y edita los datos y cuartos de las propiedades asignadas. No puede cambiar propietarios ni permisos de acceso."
                  : role === "owner"
                    ? "Consulta únicamente las propiedades de la persona vinculada y sus cuartos. No puede modificar datos."
                    : "Consulta las propiedades asignadas y registra o edita sus cuartos. No cambia datos de la propiedad ni permisos."}
            </p>
          </div>
          {(role === "operator" || role === "property_admin") && (
            <fieldset>
              <legend>Propiedades autorizadas</legend>
              {!properties.length && (
                <p>
                  Primero registra una propiedad. Puedes guardar la cuenta sin
                  propiedades y asignarlas después.
                </p>
              )}
              {properties.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    checked={assigned.includes(p.id)}
                    onChange={(e) =>
                      setAssigned(
                        e.target.checked
                          ? [...assigned, p.id]
                          : assigned.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          )}
          {editing.id === currentUser.id && (
            <p className="muted">
              Estás editando tu propia cuenta. El sistema protege el acceso del
              último administrador general.
            </p>
          )}
          <FormActions saving={saving} onCancel={() => setEditing(null)} />
        </form>
      </section>
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESO AL SISTEMA</p>
          <h1>Usuarios y permisos</h1>
          <p className="muted">
            Define quién puede ingresar y qué propiedades puede administrar.
          </p>
        </div>
        <button onClick={() => edit({})}>Registrar usuario</button>
      </div>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      <div className="record-list">
        {users.map((u) => (
          <article key={u.id}>
            <div className="record-main">
              <h2>{u.full_name}</h2>
              <p>
                Usuario: {u.username} · {roleNames[u.role]}
              </p>
              <p>
                {u.is_active ? "Cuenta habilitada" : "Cuenta deshabilitada"}
              </p>
              {(u.role === "property_admin" || u.role === "operator") && (
                <p>{u.property_ids.length} propiedades autorizadas</p>
              )}
            </div>
            <button className="secondary" onClick={() => edit(u)}>
              Editar permisos <span className="sr-only">de {u.full_name}</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

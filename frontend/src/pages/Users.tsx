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
  const [personChoice, setPersonChoice] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  function edit(user: Partial<User>) {
    setEditing(user);
    setRole(user.role || "operator");
    setAssigned(user.property_ids || []);
    setPersonChoice(user.person_id ? String(user.person_id) : "");
    setError("");
    setNotice("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const creatingPerson =
      personChoice === "new" && !editing?.id && role !== "owner";
    if (
      !creatingPerson &&
      !people.some(
        (person) =>
          String(person.id) === personChoice &&
          (role !== "owner" || person.is_owner),
      )
    ) {
      setError("Selecciona la persona a la que pertenece esta cuenta.");
      return;
    }
    if (
      !window.confirm(
        "¿Guardar esta cuenta y sus permisos? La persona podrá acceder a la información autorizada.",
      )
    )
      return;
    const password = String(data.get("password") || "");
    const body: Record<string, unknown> = {
      username: value(data, "username"),
      display_name: value(data, "display_name") || null,
      role,
      person_id: personChoice === "new" ? null : Number(personChoice),
      is_active: data.has("is_active"),
      property_ids:
        role === "operator" || role === "property_admin" ? assigned : [],
    };
    if (personChoice === "new" && !editing?.id)
      body.full_name = value(data, "full_name");
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
            <Field
              label={
                role === "owner" ? "Propietario vinculado" : "Persona vinculada"
              }
              hint={
                role === "owner"
                  ? "Selecciona al propietario. Su nombre y sus propiedades determinan el acceso."
                  : "Cada cuenta pertenece a una persona. Selecciona su registro para mantener un único nombre."
              }
            >
              <select
                name="person_id"
                value={personChoice}
                required
                onChange={(e) => setPersonChoice(e.target.value)}
              >
                <option value="">Seleccionar persona</option>
                {people
                  .filter((person) => role !== "owner" || person.is_owner)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                {!editing.id && role !== "owner" && (
                  <option value="new">Registrar persona nueva</option>
                )}
              </select>
            </Field>
            {personChoice === "new" && !editing.id && role !== "owner" ? (
              <Field
                label="Nombre completo de la persona"
                hint="Se creará su registro en Personas junto con la cuenta. No se marcará como propietario."
              >
                <input
                  name="full_name"
                  minLength={2}
                  maxLength={160}
                  required
                  autoComplete="off"
                />
              </Field>
            ) : (
              <Field
                label="Nombre de la persona"
                hint="Este nombre se mantiene en Personas. Para corregirlo, edita allí el registro; se actualizará también en sus cuentas."
              >
                <input
                  value={
                    people.find((person) => String(person.id) === personChoice)
                      ?.full_name || ""
                  }
                  readOnly
                  aria-readonly="true"
                />
              </Field>
            )}
            <Field
              label="Alias de la cuenta (opcional)"
              hint="Solo ayuda a identificar esta cuenta. No cambia el nombre ni la identidad de la persona."
            >
              <input
                name="display_name"
                defaultValue={editing.display_name || ""}
                maxLength={160}
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
                onChange={(e) => {
                  const nextRole = e.target.value as Role;
                  setRole(nextRole);
                  if (
                    nextRole === "owner" &&
                    !people.some(
                      (person) =>
                        String(person.id) === personChoice && person.is_owner,
                    )
                  )
                    setPersonChoice("");
                }}
              >
                {Object.entries(roleNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
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
              {u.display_name && <p>Alias de la cuenta: {u.display_name}</p>}
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

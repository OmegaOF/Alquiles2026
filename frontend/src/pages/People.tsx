import { useState } from "react";
import type { Person } from "../types";
import { api } from "../api";
import {
  Field,
  ErrorMessage,
  FormActions,
  value,
  errorText,
} from "../components/Form";

export function People({
  people,
  canEdit,
  refresh,
}: {
  people: Person[];
  canEdit: boolean;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("¿Guardar los datos de esta persona?")) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(
        `/persons${editing?.id ? `/${editing.id}` : ""}`,
        editing?.id ? "PATCH" : "POST",
        {
          full_name: value(data, "full_name"),
          document: value(data, "document") || null,
          phone: value(data, "phone"),
          whatsapp: value(data, "whatsapp"),
          email: value(data, "email") || null,
          address: value(data, "address"),
          notes: value(data, "notes"),
          is_owner: data.has("is_owner"),
        },
      );
      await refresh();
      setEditing(null);
      setNotice("Los datos de la persona se guardaron correctamente.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  if (editing)
    return (
      <section className="panel">
        <h1>{editing.id ? "Editar persona" : "Registrar persona"}</h1>
        <p>
          Los datos de contacto son opcionales. Ser propietario no requiere una
          cuenta de acceso.
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
                autoComplete="name"
              />
            </Field>
            <Field
              label="Documento de identidad (opcional)"
              hint="Usa el mismo documento para evitar registrar dos veces a una persona."
            >
              <input
                name="document"
                defaultValue={editing.document || ""}
                maxLength={80}
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <input
                name="phone"
                type="tel"
                defaultValue={editing.phone || ""}
                maxLength={40}
                autoComplete="tel"
              />
            </Field>
            <Field label="WhatsApp (opcional)">
              <input
                name="whatsapp"
                type="tel"
                defaultValue={editing.whatsapp || ""}
                maxLength={40}
              />
            </Field>
            <Field label="Correo electrónico (opcional)">
              <input
                name="email"
                type="email"
                defaultValue={editing.email || ""}
                maxLength={254}
                autoComplete="email"
              />
            </Field>
            <Field label="Dirección (opcional)">
              <input
                name="address"
                defaultValue={editing.address || ""}
                maxLength={300}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="is_owner"
                defaultChecked={editing.is_owner ?? true}
              />
              Es propietario o propietaria
            </label>
            <Field label="Observaciones (opcional)">
              <textarea
                name="notes"
                defaultValue={editing.notes || ""}
                maxLength={2000}
              />
            </Field>
          </div>
          <FormActions saving={saving} onCancel={() => setEditing(null)} />
        </form>
      </section>
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERSONAS</p>
          <h1>Personas y propietarios</h1>
          <p className="muted">
            {canEdit
              ? "Un registro por persona, tenga o no una cuenta de acceso."
              : "Personas vinculadas a las propiedades que tienes autorizadas."}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setEditing({});
              setError("");
              setNotice("");
            }}
          >
            Registrar persona
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {people.length === 0 ? (
        <div className="empty">
          Todavía no hay personas para mostrar.
          {canEdit && " Comienza registrando un propietario."}
        </div>
      ) : (
        <div className="record-list">
          {people.map((person) => (
            <article key={person.id}>
              <div className="record-main">
                <h2>{person.full_name}</h2>
                <p>
                  {person.is_owner ? "Propietario/a" : "Persona registrada"}
                  {person.document ? ` · Documento: ${person.document}` : ""}
                </p>
                <p>
                  {person.phone || "Sin teléfono"}
                  {person.whatsapp ? ` · WhatsApp: ${person.whatsapp}` : ""}
                </p>
                {person.email && <p>{person.email}</p>}
                {person.address && <p>{person.address}</p>}
                {person.notes && <p>{person.notes}</p>}
              </div>
              {canEdit && (
                <button
                  className="secondary"
                  onClick={() => {
                    setEditing(person);
                    setError("");
                  }}
                >
                  Editar <span className="sr-only">a {person.full_name}</span>
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

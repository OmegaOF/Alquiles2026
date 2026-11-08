import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { roleNames } from "../../types";
import type {
  ReminderPreference,
  ReminderKind,
  Template,
} from "../../reminders";
import { reminderKinds, newFinanceKey } from "../../reminders";

export function Preferences({
  base,
  admin,
  onSaved,
}: {
  base: string;
  admin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [prefs, setPrefs] = useState<ReminderPreference | null>(null),
    [days, setDays] = useState(""),
    [templates, setTemplates] = useState<Template[]>([]),
    [fields, setFields] = useState<string[]>([]),
    [kind, setKind] = useState<ReminderKind>("rent"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const prefKey = useRef(newFinanceKey()),
    templateKey = useRef(newFinanceKey());
  async function load() {
    const [p, t] = await Promise.all([
      api<ReminderPreference>(base + "/preferences"),
      api<{ items: Template[]; fields: string[] }>(base + "/templates"),
    ]);
    setPrefs(p);
    setDays(p.lead_days.join(", "));
    setTemplates(t.items);
    setFields(t.fields);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, [base]);
  const template = templates.find((t) => t.kind === kind);
  async function savePrefs(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    const selected = days.split(",").map((v) => v.trim());
    if (selected.some((v) => !/^\d+$/.test(v))) {
      setError("Escribe los días separados por comas, por ejemplo 7, 3, 1.");
      return;
    }
    if (
      !window.confirm(
        "¿Guardar estas preferencias? Cambian la atención de los avisos, sin modificar saldos ni vencimientos contractuales.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const { eligible_users, ...body } = prefs;
      await api(base + "/preferences", "POST", {
        ...body,
        property_id: undefined,
        version: undefined,
        request_key: prefKey.current,
        expected_version: prefs.version,
        lead_days: selected.map(Number),
      });
      await load();
      await onSaved();
      prefKey.current = newFinanceKey();
      setNotice(
        "Preferencias guardadas. Los importes y vencimientos originales se conservan.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!template) return;
    const form = new FormData(e.currentTarget);
    if (
      !window.confirm(
        "¿Guardar esta plantilla para esta casa? Se conservarán los textos de comunicaciones anteriores.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(base + "/templates", "POST", {
        request_key: templateKey.current,
        expected_version: template.version,
        kind,
        name: String(form.get("name")),
        body: String(form.get("body")),
        is_active: form.has("is_active"),
      });
      await load();
      templateKey.current = newFinanceKey();
      setNotice(
        "Plantilla guardada. Los mensajes anteriores conservan su texto.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Preferencias y plantillas de avisos</h2>
      <ErrorMessage message={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {prefs && (
        <form className="panel" onSubmit={(e) => void savePrefs(e)}>
          <h3>Cuándo requieren atención</h3>
          <Field label="Días previos al vencimiento">
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={!admin}
              required
              maxLength={100}
            />
          </Field>
          <p>
            Ejemplo: 7, 3, 1. Los avisos se muestran desde el mayor plazo. Al
            alcanzar otro hito vuelven a requerir revisión; los vencidos se
            revisan cada día.
          </p>
          <Field label="Máximo de días para posponer">
            <input
              type="number"
              min={1}
              max={30}
              value={prefs.snooze_days}
              onChange={(e) =>
                setPrefs({ ...prefs, snooze_days: Number(e.target.value) })
              }
              disabled={!admin}
              required
            />
          </Field>
          <fieldset>
            <legend>Tipos de aviso</legend>
            {prefs.types.map((t, index) => (
              <div className="utility-space" key={t.kind}>
                <strong>{reminderKinds[t.kind]}</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={t.is_enabled}
                    disabled={!admin}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        types: prefs.types.map((v, i) =>
                          i === index
                            ? { ...v, is_enabled: e.target.checked }
                            : v,
                        ),
                      })
                    }
                  />{" "}
                  Mostrar avisos de {reminderKinds[t.kind].toLowerCase()}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={t.allow_whatsapp}
                    disabled={!admin}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        types: prefs.types.map((v, i) =>
                          i === index
                            ? { ...v, allow_whatsapp: e.target.checked }
                            : v,
                        ),
                      })
                    }
                  />{" "}
                  Ofrecer WhatsApp para {reminderKinds[t.kind].toLowerCase()}
                </label>
              </div>
            ))}
          </fieldset>
          {admin && (
            <fieldset>
              <legend>Destinatarios internos autorizados</legend>
              <p>
                Sin selección, todos los usuarios con acceso ordinario a esta
                casa pueden consultar sus avisos. Los administradores conservan
                acceso para supervisar. Esto no envía mensajes ni concede acceso
                a otras casas.
              </p>
              {(prefs.eligible_users || []).map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    checked={prefs.recipient_user_ids.includes(u.id)}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        recipient_user_ids: e.target.checked
                          ? [...prefs.recipient_user_ids, u.id]
                          : prefs.recipient_user_ids.filter(
                              (id) => id !== u.id,
                            ),
                      })
                    }
                  />
                  {u.full_name} · {roleNames[u.role]}
                </label>
              ))}
            </fieldset>
          )}
          {admin && (
            <button disabled={busy}>Guardar preferencias de esta casa</button>
          )}
        </form>
      )}
      <section className="panel">
        <h3>Plantilla predeterminada por tipo</h3>
        <Field label="Tipo de plantilla">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ReminderKind);
              templateKey.current = newFinanceKey();
            }}
          >
            {Object.entries(reminderKinds).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <p>
          Campos disponibles: {fields.map((f) => `{${f}}`).join(", ")}. Las
          llaves se sustituyen por información real. No incluyas datos bancarios
          privados, documentos de identidad ni afirmaciones de envío o
          penalidades automáticas.
        </p>
        {template && (
          <form
            key={`${kind}-${template.version}`}
            onSubmit={(e) => void saveTemplate(e)}
          >
            <Field label="Nombre de la plantilla">
              <input
                name="name"
                defaultValue={template.name}
                required
                minLength={3}
                maxLength={100}
                disabled={!admin}
              />
            </Field>
            <Field label="Texto de la plantilla">
              <textarea
                name="body"
                defaultValue={template.body}
                rows={9}
                required
                minLength={10}
                maxLength={4000}
                disabled={!admin}
              />
            </Field>
            <label>
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={template.is_active}
                disabled={!admin}
              />{" "}
              Usar esta plantilla personalizada; sin marcar se utiliza el texto
              inicial del sistema
            </label>
            {admin && <button disabled={busy}>Guardar plantilla</button>}
          </form>
        )}
      </section>
    </section>
  );
}

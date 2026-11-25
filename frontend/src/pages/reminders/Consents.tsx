import {
  RecordCollection,
  RecordField,
  RecordRow,
} from "../../components/RecordList";
import { StatusIndicator } from "../../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { SearchSelect, personOption } from "../../components/SearchSelect";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import type { Person } from "../../types";
import type { Consent } from "../../reminders";
import { newFinanceKey, showDate } from "../../reminders";

export function Consents({
  base,
  people,
  admin,
  today,
  initial,
  onBack,
}: {
  base: string;
  people: Person[];
  admin: boolean;
  today: string;
  initial?: { personId: number; purpose: string } | null;
  onBack?: () => void;
}) {
  const [items, setItems] = useState<Consent[]>([]),
    [purposes, setPurposes] = useState<Record<string, string>>({}),
    [personId, setPersonId] = useState(initial?.personId || people[0]?.id || 0),
    [purpose, setPurpose] = useState(initial?.purpose || "payments"),
    [number, setNumber] = useState(""),
    [bolivia, setBolivia] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revoke, setRevoke] = useState<number | null>(null),
    [history, setHistory] = useState<
      {
        id: number;
        action: string;
        actor_id: number;
        created_at: string;
        details: string;
      }[]
    >([]);
  const requestKey = useRef(newFinanceKey());
  const current = items.find(
      (c) => c.person_id === personId && c.purpose === purpose,
    ),
    person = people.find((p) => p.id === personId);
  async function load() {
    const data = await api<{
      items: Consent[];
      purposes: Record<string, string>;
    }>(base + "/consents");
    setItems(data.items);
    setPurposes(data.purposes);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, [base]);
  useEffect(() => {
    setNumber(person?.whatsapp || person?.phone || "");
    setBolivia(false);
    requestKey.current = newFinanceKey();
  }, [personId, purpose, people]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form);
    if (
      !window.confirm(
        "¿Registrar la aceptación expresa de esta persona para este número, casa y tipo de comunicación? Tener un teléfono guardado no equivale a dar consentimiento.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(base + "/consents", "POST", {
        request_key: requestKey.current,
        expected_version: current?.version || 0,
        person_id: personId,
        purpose,
        number,
        bolivia_local: bolivia,
        accepted_on: String(values.get("accepted_on")),
        method: String(values.get("method")),
        notes: String(values.get("notes") || "") || null,
        explicitly_accepted: values.has("explicitly_accepted"),
      });
      await load();
      requestKey.current = newFinanceKey();
      form.reset();
      setNotice(
        "Consentimiento registrado. Cada apertura volverá a comprobar su vigencia.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function revokeConsent(
    e: React.FormEvent<HTMLFormElement>,
    c: Consent,
  ) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason"));
    if (
      !window.confirm(
        "¿Revocar este consentimiento? Se impedirán nuevas aperturas para esta autorización y se conservarán sus avisos e historial.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/consents/${c.id}/revoke`, "POST", {
        request_key: requestKey.current,
        expected_version: c.version,
        reason,
      });
      await load();
      setRevoke(null);
      requestKey.current = newFinanceKey();
      setNotice(
        "Consentimiento revocado. Las deudas y avisos internos se conservan.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(c: Consent) {
    try {
      setHistory(await api(`${base}/consents/${c.id}/history`));
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section>
      <h2>Consentimientos de WhatsApp</h2>
      <p>
        La autorización corresponde a una persona, número, casa y tipo de
        comunicación. No se activan consentimientos automáticamente.
      </p>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {admin && (
        <form className="panel" onSubmit={(e) => void save(e)}>
          <h3>Registrar aceptación expresa</h3>
          <SearchSelect
            label="Persona que autoriza WhatsApp"
            value={personId || ""}
            required
            options={people.map(personOption)}
            onChange={(value) => setPersonId(Number(value))}
          />
          <Field label="Tipo de comunicación autorizado">
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {Object.entries(purposes).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <p>
            WhatsApp guardado: {person?.whatsapp || "Sin número"} · Teléfono
            guardado: {person?.phone || "Sin número"}. La autorización debe
            corresponder a estos datos.
          </p>
          <Field label="Número internacional autorizado">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              type="tel"
              maxLength={40}
              required
              placeholder="Ejemplo: +591 71234567"
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={bolivia}
              onChange={(e) => setBolivia(e.target.checked)}
            />{" "}
            Elegí un número local de Bolivia: agregar 591 a sus ocho dígitos
          </label>
          <p>
            Para otros países escribe su prefijo internacional. No se agregan
            prefijos extranjeros automáticamente.
          </p>
          <Field label="Fecha de aceptación">
            <input
              name="accepted_on"
              type="date"
              defaultValue={today}
              max={today}
              required
            />
          </Field>
          <Field label="Cómo se obtuvo la aceptación">
            <input
              name="method"
              minLength={3}
              maxLength={160}
              required
              placeholder="Por ejemplo: aceptación expresa por escrito"
            />
          </Field>
          <Field label="Observaciones de la autorización">
            <textarea name="notes" maxLength={1000} />
          </Field>
          <label>
            <input type="checkbox" name="explicitly_accepted" required />{" "}
            Confirmo que la persona aceptó expresamente este número, casa y tipo
            de comunicación
          </label>
          <div className="form-actions">
            <button disabled={busy}>Revisar y registrar consentimiento</button>
            {onBack && (
              <button
                type="button"
                className="secondary"
                onClick={onBack}
                disabled={busy}
              >
                Volver al aviso
              </button>
            )}
          </div>
        </form>
      )}
      <h3>Autorizaciones registradas</h3>
      <RecordCollection
        id={`${base}:consents`}
        label="autorizaciones"
        items={items}
        searchable={(c) =>
          `${people.find((p) => p.id === c.person_id)?.full_name ?? ""} ${purposes[c.purpose]} ${c.number} ${c.accepted_on} ${c.method}`
        }
        filter={{
          label: "Estado de la autorización",
          value: (c) => (c.is_active ? "Vigente" : "Revocado"),
        }}
        empty="No hay autorizaciones registradas para esta consulta."
        render={(c) => (
          <RecordRow
            key={c.id}
            title={
              people.find((p) => p.id === c.person_id)?.full_name ||
              "Persona autorizada"
            }
            fields={
              <>
                <RecordField label="Motivo autorizado">
                  {purposes[c.purpose]}
                </RecordField>
                <RecordField label="Número">+{c.number}</RecordField>
                <RecordField label="Fecha de aceptación">
                  {showDate(c.accepted_on)}
                </RecordField>
                <RecordField label="Estado">
                  <StatusIndicator
                    tone={c.is_active ? "blue" : "gray"}
                    label={c.is_active ? "Vigente" : "Revocado"}
                  />
                </RecordField>
                {!c.matches_current_number && (
                  <RecordField label="Contacto">
                    <StatusIndicator
                      tone="amber"
                      label="Número ya no coincide"
                    />
                  </RecordField>
                )}
              </>
            }
            actions={
              <>
                <button
                  className="secondary"
                  onClick={() => void showHistory(c)}
                >
                  Ver historial de autorización {c.id}
                </button>
                {admin && c.is_active && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setRevoke(c.id);
                      requestKey.current = newFinanceKey();
                    }}
                  >
                    Revocar autorización {c.id}
                  </button>
                )}
              </>
            }
            expanded={
              revoke === c.id && (
                <form onSubmit={(e) => void revokeConsent(e, c)}>
                  <Field label="Motivo de revocación">
                    <textarea
                      name="reason"
                      minLength={3}
                      maxLength={1000}
                      required
                    />
                  </Field>
                  <button disabled={busy}>Confirmar revocación</button>
                </form>
              )
            }
            detail={
              <>
                <p>
                  Aceptado mediante {c.method}. Registró usuario {c.recorded_by}
                  .
                </p>
                {!c.matches_current_number && (
                  <p role="alert">
                    El número ya no coincide con el contacto. Se requiere
                    revisar una nueva autorización.
                  </p>
                )}
                {c.revoked_at && (
                  <p>
                    Revocación registrada:{" "}
                    {new Date(c.revoked_at + "Z").toLocaleString("es-BO")}.
                  </p>
                )}
              </>
            }
          />
        )}
      />
      {history.length > 0 && (
        <section className="panel">
          <h3>Historial de aceptación y revocación</h3>
          <RecordCollection
            label="eventos de consentimiento"
            items={history}
            searchable={(e) =>
              `${e.action === "consent-granted" ? "Aceptación" : "Revocación"} ${e.actor_id} ${e.created_at}`
            }
            render={(e) => (
              <RecordRow
                key={e.id}
                title={
                  <StatusIndicator
                    tone={e.action === "consent-granted" ? "green" : "gray"}
                    label={
                      e.action === "consent-granted"
                        ? "Aceptación registrada"
                        : "Revocación registrada"
                    }
                  />
                }
                fields={
                  <>
                    <RecordField label="Usuario">{e.actor_id}</RecordField>
                    <RecordField label="Fecha">
                      {new Date(e.created_at + "Z").toLocaleString("es-BO")}
                    </RecordField>
                  </>
                }
              />
            )}
          />
        </section>
      )}
    </section>
  );
}

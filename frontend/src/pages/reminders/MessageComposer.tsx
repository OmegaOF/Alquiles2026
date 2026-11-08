import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import {
  money,
  showDate,
  newFinanceKey,
  communicationNames,
} from "../../reminders";
import type {
  Reminder,
  Proposal,
  Communication,
  MessageResult,
} from "../../reminders";

export function MessageComposer({
  event,
  base,
  userId,
  onSaved,
  onCancel,
  onConsent,
}: {
  event: Reminder;
  base: string;
  userId: number;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onConsent: (personId: number, purpose: string) => void;
}) {
  const [recipient, setRecipient] = useState(
      event.recipients.length === 1 ? event.recipients[0].id : 0,
    ),
    [draft, setDraft] = useState<Proposal | null>(null),
    [text, setText] = useState(""),
    [communication, setCommunication] = useState<Communication | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const sequence = useRef(0),
    prepareKey = useRef(newFinanceKey()),
    keys = useRef<
      Record<
        string,
        {
          request_key: string;
          expected_version: number;
          action: string;
          notes: string | null;
        }
      >
    >({});
  const openedKeys = useRef<Record<number, string>>({});
  async function propose() {
    if (!recipient) return;
    const current = ++sequence.current;
    setBusy(true);
    setError("");
    setCommunication(null);
    setDraft(null);
    try {
      const p = await api<Proposal>(
        `${base}/notices/${event.key}/proposal?recipient_id=${recipient}`,
      );
      if (current === sequence.current) {
        setDraft(p);
        setText(p.text);
        prepareKey.current = newFinanceKey();
        keys.current = {};
        openedKeys.current = {};
      }
    } catch (e) {
      if (current === sequence.current) setError(errorText(e));
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    void propose();
    return () => {
      sequence.current++;
    };
  }, [recipient]);
  async function save() {
    if (!draft) return;
    if (
      !window.confirm(
        "¿Guardar este texto revisado? Esto no abre WhatsApp ni registra un envío.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<MessageResult>(
        `${base}/notices/${event.key}/messages`,
        "POST",
        {
          request_key: prepareKey.current,
          expected_version: draft.event.version,
          expected_fingerprint: draft.event.source_fingerprint,
          expected_proposal_fingerprint: draft.proposal_fingerprint,
          recipient_id: recipient,
          text,
        },
      );
      setCommunication(
        await api<Communication>(
          `${base}/communications/${r.communication_id}`,
        ),
      );
      await onSaved();
      setNotice("Mensaje preparado. El envío sigue a cargo del usuario.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: string, notes?: string) {
    if (!communication) return;
    // Un reintento conserva también la versión original si se perdió la respuesta.
    const payload = keys.current[kind] || {
      request_key: newFinanceKey(),
      expected_version: communication.version,
      action: kind,
      notes: notes || null,
    };
    keys.current[kind] = payload;
    const result = await api<MessageResult>(
      `${base}/communications/${communication.id}/actions`,
      "POST",
      payload,
    );
    delete keys.current[kind];
    return result;
  }
  async function open() {
    if (!communication || busy) return;
    if (
      !window.confirm(
        "¿Abrir WhatsApp con este destinatario y mensaje? Debes realizar el envío personalmente. Abrirlo no confirma envío, entrega ni lectura.",
      )
    )
      return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError(
        "El navegador bloqueó la ventana. Permite abrir WhatsApp y vuelve a intentarlo; no se registró una apertura.",
      );
      return;
    }
    tab.opener = null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action("authorize_open");
      if (!result?.url) throw new Error("No se recibió un enlace autorizado.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "wa.me" || url.port)
        throw new Error("El enlace no corresponde al sitio oficial permitido.");
      tab.location.href = result.url;
      if (!result.authorization_operation_id)
        throw new Error("Vuelve a comprobar la autorización de apertura.");
      const grant = result.authorization_operation_id;
      const openedKey = openedKeys.current[grant] || newFinanceKey();
      openedKeys.current[grant] = openedKey;
      await api(`${base}/communications/${communication.id}/actions`, "POST", {
        request_key: openedKey,
        expected_version: result.version,
        action: "opened",
        authorization_operation_id: result.authorization_operation_id,
      });
      delete openedKeys.current[grant];
      setCommunication(
        await api<Communication>(`${base}/communications/${communication.id}`),
      );
      await onSaved();
      setNotice(
        "Apertura registrada. No se ha confirmado que el mensaje se haya enviado.",
      );
    } catch (e) {
      tab.close();
      setError(errorText(e));
      setCommunication(
        await api<Communication>(
          `${base}/communications/${communication.id}`,
        ).catch(() => communication),
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm(kind: string) {
    if (!communication) return;
    if (
      !window.confirm(
        kind === "manual_sent"
          ? "¿Confirmas que tú realizaste el envío? Esta confirmación manual no demuestra entrega ni lectura."
          : "¿Registrar que este mensaje no se envió? Se conservará el texto y su historial.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await action(kind);
      setCommunication(
        await api<Communication>(`${base}/communications/${communication.id}`),
      );
      await onSaved();
      setNotice(
        kind === "manual_sent"
          ? "Envío confirmado manualmente. No hay confirmación técnica de entrega o lectura."
          : "Registrado como no enviado.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Texto copiado. Copiarlo no confirma un envío.");
    } catch {
      setError(
        "No se pudo copiar automáticamente. Puedes seleccionar y copiar el texto del mensaje.",
      );
    }
  }
  return (
    <section className="panel">
      <h2>Preparar WhatsApp</h2>
      <p>
        Revisa persona, número y mensaje. Tú realizas el envío desde WhatsApp.
      </p>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <Field label="Destinatario del aviso">
        <select
          value={recipient || ""}
          onChange={(e) => {
            setRecipient(Number(e.target.value));
            setNotice("");
          }}
          disabled={busy || !!communication}
        >
          <option value="">Seleccionar persona relacionada</option>
          {event.recipients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </Field>
      {recipient > 0 && !draft && !busy && (
        <button
          className="secondary"
          onClick={() => onConsent(recipient, event.purpose)}
        >
          Revisar consentimiento y número
        </button>
      )}
      {busy && !draft && (
        <p role="status">Comprobando datos y consentimiento…</p>
      )}
      {draft && (
        <>
          <section
            className="utility-space"
            aria-label="Datos revisados del mensaje"
          >
            <h3>Revisar antes de abrir</h3>
            <p>
              Destinatario: <strong>{draft.recipient_name}</strong>
            </p>
            <p>
              Número autorizado: <strong>+{draft.number}</strong>
            </p>
            <p>
              Casa: {draft.event.property_name} · {draft.event.target_label}
            </p>
            <p>Concepto: {draft.event.concept}</p>
            {draft.event.amount !== null && (
              <p>
                {draft.event.kind === "report"
                  ? "Importe reportado, pendiente de confirmar"
                  : "Saldo pendiente actual"}
                :{" "}
                <strong>
                  {money(draft.event.amount, draft.event.currency || "BOB")}
                </strong>
              </p>
            )}
            <p>
              Vencimiento:{" "}
              {draft.event.due_on
                ? showDate(draft.event.due_on)
                : "Fecha pendiente de definir; este mensaje trata de un reporte por verificar."}
            </p>
            <p>
              Consentimiento vigente para esta casa y tipo de comunicación,
              aceptado el {showDate(draft.consent.accepted_on)} mediante{" "}
              {draft.consent.method}.
            </p>
          </section>
          <Field label="Mensaje para revisar y editar">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              minLength={3}
              maxLength={5000}
              readOnly={!!communication}
            />
          </Field>
          <div className="form-actions">
            <button className="secondary" onClick={() => void copy()}>
              Copiar texto
            </button>
            {!communication && (
              <button
                onClick={() => void save()}
                disabled={busy || text.trim().length < 3}
              >
                Guardar mensaje preparado
              </button>
            )}
            <button
              className="secondary"
              onClick={() => void propose()}
              disabled={busy}
            >
              Generar texto actualizado
            </button>
          </div>
          {communication && (
            <section className="utility-space">
              <h3>Situación de la comunicación</h3>
              <p>
                <strong>{communicationNames[communication.state]}</strong>
              </p>
              <p>
                Abrir WhatsApp no demuestra envío, entrega ni lectura. La deuda
                conserva su propio estado.
              </p>
              {communication.created_by === userId &&
                ["prepared", "opened"].includes(communication.state) && (
                  <div className="form-actions">
                    <button onClick={() => void open()} disabled={busy}>
                      Abrir WhatsApp
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void confirm("manual_sent")}
                      disabled={busy}
                    >
                      Confirmar que yo lo envié
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void confirm("not_sent")}
                      disabled={busy}
                    >
                      Registrar como no enviado
                    </button>
                  </div>
                )}
            </section>
          )}
        </>
      )}
      <button className="secondary" onClick={onCancel} disabled={busy}>
        Volver al aviso
      </button>
    </section>
  );
}

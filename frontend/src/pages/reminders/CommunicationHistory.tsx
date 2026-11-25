import {
  RecordCollection,
  RecordField,
  RecordRow,
  useListPreference,
} from "../../components/RecordList";
import {
  RecordStatus,
  StatusIndicator,
} from "../../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import type { Communication } from "../../reminders";
import { communicationNames, newFinanceKey } from "../../reminders";

export function CommunicationHistory({
  base,
  noticeKey,
}: {
  base: string;
  noticeKey?: string;
}) {
  const [items, setItems] = useState<Communication[]>([]),
    [selected, setSelected] = useState<Communication | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [correcting, setCorrecting] = useState(false),
    [busy, setBusy] = useState(false),
    [recipient, setRecipient] = useListPreference(
      `${base}:communications:${noticeKey ?? "all"}:recipient`,
      0,
    );
  const requestKey = useRef(newFinanceKey());
  async function load() {
    setItems(
      await api<Communication[]>(
        base +
          "/communications" +
          (noticeKey ? "?key=" + encodeURIComponent(noticeKey) : ""),
      ),
    );
  }
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, [base, noticeKey]);
  async function detail(id: number) {
    try {
      setSelected(await api<Communication>(`${base}/communications/${id}`));
      setCorrecting(false);
      requestKey.current = newFinanceKey();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function correct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const data = new FormData(e.currentTarget);
    if (
      !window.confirm(
        "¿Corregir esta confirmación con un nuevo evento? El registro anterior permanecerá en el historial.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/communications/${selected.id}/actions`, "POST", {
        request_key: requestKey.current,
        expected_version: selected.version,
        action: String(data.get("action")),
        notes: String(data.get("notes")),
      });
      await detail(selected.id);
      await load();
      setNotice(
        "Corrección registrada. No cambió ninguna obligación ni movimiento.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const recipients = [
    ...new Map(items.map((v) => [v.recipient_id, v.recipient_name])).entries(),
  ];
  return (
    <section>
      <h2>Historial de comunicaciones</h2>
      <p>
        Un mensaje preparado o una apertura no prueban envío. La confirmación
        manual tampoco demuestra entrega o lectura en WhatsApp.
      </p>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <Field label="Destinatario del historial">
        <select
          value={recipient || ""}
          onChange={(e) => setRecipient(Number(e.target.value))}
        >
          <option value="">Todos los autorizados</option>
          {recipients.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <RecordCollection
        id={`${base}:communications:${noticeKey ?? "all"}`}
        label="comunicaciones"
        items={items.filter((c) => !recipient || c.recipient_id === recipient)}
        searchable={(c) =>
          `${c.id} ${c.recipient_name} ${c.event.concept} ${c.event.property_name} ${c.masked_number} ${communicationNames[c.state]} ${c.created_at}`
        }
        filter={{
          label: "Estado de la comunicación",
          value: (c) => communicationNames[c.state],
        }}
        empty="No hay comunicaciones registradas en esta consulta."
        render={(c) => (
          <RecordRow
            key={c.id}
            title={c.recipient_name}
            fields={
              <>
                <RecordField label="Aviso">
                  {c.event.concept} · {c.event.property_name}
                </RecordField>
                <RecordField label="Número">{c.masked_number}</RecordField>
                <RecordField label="Preparado">
                  {new Date(c.created_at + "Z").toLocaleString("es-BO")}
                </RecordField>
                <RecordField label="Estado">
                  <RecordStatus domain="communication" state={c.state} />
                </RecordField>
                {c.source_changed && (
                  <RecordField label="Origen">
                    <StatusIndicator tone="amber" label="Origen actualizado" />
                  </RecordField>
                )}
              </>
            }
            actions={
              <button className="secondary" onClick={() => void detail(c.id)}>
                Ver comunicación {c.id}
              </button>
            }
          />
        )}
      />
      {selected && (
        <section className="panel">
          <h3>Texto e historial de la comunicación</h3>
          <p>
            {selected.recipient_name} · +{selected.number}
          </p>
          <p>
            Situación:{" "}
            <RecordStatus domain="communication" state={selected.state} />
          </p>
          <p className="reminder-message">{selected.final_text}</p>
          <p>
            Mensaje preparado por usuario {selected.created_by} el{" "}
            {new Date(selected.created_at + "Z").toLocaleString("es-BO")}.
          </p>
          <RecordCollection
            id={`${base}:communications:${selected.id}:events`}
            label="eventos de comunicación"
            items={selected.events}
            searchable={(e) =>
              `${communicationNames[e.kind]} ${e.created_by} ${e.created_at} ${e.notes ?? ""}`
            }
            filter={{
              label: "Tipo de evento",
              value: (e) => communicationNames[e.kind],
            }}
            render={(e) => (
              <RecordRow
                key={e.id}
                title={<RecordStatus domain="communication" state={e.kind} />}
                fields={
                  <>
                    <RecordField label="Usuario">{e.created_by}</RecordField>
                    <RecordField label="Fecha">
                      {new Date(e.created_at + "Z").toLocaleString("es-BO")}
                    </RecordField>
                  </>
                }
                detail={e.notes && <p>{e.notes}</p>}
                detailLabel="Ver observaciones"
              />
            )}
          />
          {selected.can_confirm &&
            ["manual_sent", "not_sent"].includes(selected.state) && (
              <button className="secondary" onClick={() => setCorrecting(true)}>
                Corregir confirmación anterior
              </button>
            )}
          {correcting && (
            <form onSubmit={(e) => void correct(e)}>
              <Field label="Situación que corresponde">
                <select name="action">
                  <option value="correct_not_sent">No se envió</option>
                  <option value="correct_sent">Yo sí realicé el envío</option>
                </select>
              </Field>
              <Field label="Motivo de la corrección">
                <textarea
                  name="notes"
                  required
                  minLength={3}
                  maxLength={1000}
                />
              </Field>
              <button disabled={busy}>
                Registrar corrección con historial
              </button>
            </form>
          )}
        </section>
      )}
    </section>
  );
}

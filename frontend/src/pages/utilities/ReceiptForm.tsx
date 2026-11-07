import { useState } from "react";
import { api } from "../../api";
import type { Receipt, ServiceAccount } from "../../utilities";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { addDays, localToday } from "../../tenancy";

export function ReceiptForm({
  accounts,
  initial,
  onCancel,
  onSaved,
}: {
  accounts: ServiceAccount[];
  initial?: Receipt;
  onCancel: () => void;
  onSaved: (receipt: Receipt) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(
      initial?.account_id || accounts.find((a) => a.is_active)?.id || 0,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = accounts.find((a) => a.id === accountId),
    today = localToday();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        "¿Guardar los datos del recibo existente del proveedor? Esto no registra un pago ni emite un documento de cobro.",
      )
    )
      return;
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const body = {
      external_reference: String(values.get("reference") || "") || null,
      amount: String(values.get("amount")),
      currency: String(values.get("currency")),
      issued_on: String(values.get("issued")),
      period_start: String(values.get("start")),
      period_end: String(values.get("end")),
      due_on: String(values.get("due")),
      consumption: String(values.get("consumption") || "") || null,
      fixed_amount: String(values.get("fixed") || "0"),
      document_reference: String(values.get("document") || "") || null,
      notes: String(values.get("notes") || "") || null,
    };
    try {
      const result = await api<Receipt>(
        initial
          ? `/utility-receipts/${initial.id}`
          : `/service-accounts/${accountId}/receipts`,
        initial ? "PATCH" : "POST",
        {
          ...body,
          ...(initial
            ? {
                expected_version: initial.version,
                reason: String(values.get("reason")),
              }
            : {}),
        },
      );
      await onSaved(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>
        {initial
          ? "Corregir recibo registrado"
          : "Registrar recibo del proveedor"}
      </h2>
      <p>
        Copia los datos de un recibo o cuenta de consumo que ya recibiste. No se
        emite ningún documento ni se registra dinero pagado.
      </p>
      <ErrorMessage message={error} />
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Servicio del recibo">
            <select
              required
              value={accountId || ""}
              disabled={!!initial}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              <option value="">Seleccionar suministro</option>
              {accounts
                .filter((a) => a.is_active || a.id === initial?.account_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.provider}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Referencia externa del recibo (opcional)">
            <input
              name="reference"
              defaultValue={initial?.external_reference || ""}
              maxLength={120}
            />
          </Field>
          <Field label="Importe total del recibo">
            <input
              name="amount"
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              required
              defaultValue={initial?.amount}
            />
          </Field>
          <Field label="Moneda del recibo">
            <select name="currency" defaultValue={initial?.currency || "BOB"}>
              {[
                ...new Set(["BOB", "USD", "EUR", initial?.currency || "BOB"]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha de emisión del recibo externo">
            <input
              name="issued"
              type="date"
              required
              defaultValue={initial?.issued_on || today}
            />
          </Field>
          <Field label="Inicio del periodo de consumo">
            <input
              name="start"
              type="date"
              required
              defaultValue={initial?.period_start || today.slice(0, 8) + "01"}
            />
          </Field>
          <Field label="Fin del periodo de consumo">
            <input
              name="end"
              type="date"
              required
              defaultValue={initial?.period_end || today}
            />
          </Field>
          <Field label="Fecha límite de pago al proveedor">
            <input
              name="due"
              type="date"
              required
              defaultValue={initial?.due_on || addDays(today, 15)}
            />
          </Field>
          <Field
            label={`Consumo indicado por el proveedor (opcional)${current?.measure_unit ? " · " + current.measure_unit : ""}`}
          >
            <input
              name="consumption"
              type="number"
              min={0}
              step="0.000001"
              defaultValue={initial?.consumption || ""}
            />
          </Field>
          <Field label="Parte fija o común incluida en el total (opcional)">
            <input
              name="fixed"
              type="number"
              min={0}
              step="0.01"
              defaultValue={initial?.fixed_amount || "0"}
            />
          </Field>
          <Field label="Referencia del comprobante externo (opcional)">
            <input
              name="document"
              maxLength={500}
              defaultValue={initial?.document_reference || ""}
            />
          </Field>
          <Field label="Observaciones del recibo (opcional)">
            <textarea
              name="notes"
              maxLength={3000}
              defaultValue={initial?.notes || ""}
            />
          </Field>
          {initial && (
            <Field label="Motivo de la corrección del recibo">
              <textarea name="reason" minLength={3} maxLength={2000} required />
            </Field>
          )}
        </div>
        <p>
          El periodo incluye ambos extremos y utiliza días reales. Sus fechas
          son independientes de las del alquiler.
        </p>
        <div className="actions">
          <button disabled={busy || !accountId}>
            {busy
              ? "Guardando…"
              : initial
                ? "Guardar corrección del recibo"
                : "Guardar recibo"}
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

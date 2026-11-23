import { useRef, useState } from "react";
import { api } from "../../api";
import { SearchSelect } from "../../components/SearchSelect";
import { ContextDialog } from "../../components/ContextDialog";
import { ServiceForm } from "./Services";
import { supplyOption } from "../../utilities";
import type { Receipt, ServiceAccount } from "../../utilities";
import {
  Field,
  ErrorMessage,
  errorText,
  confirmFormDiscard,
  markFormChanged,
} from "../../components/Form";
import { addDays, localToday } from "../../tenancy";

export function ReceiptForm({
  accounts,
  initial,
  onCancel,
  onSaved,
  createSupply,
}: {
  accounts: ServiceAccount[];
  initial?: Receipt;
  createSupply?: Omit<
    Parameters<typeof ServiceForm>[0],
    "initial" | "onCancel" | "onSaved"
  > & { onAdded: (account: ServiceAccount) => void };
  onCancel: () => void;
  onSaved: (receipt: Receipt) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newSupply, setNewSupply] = useState<ServiceAccount>();
  const supplies =
    newSupply && !accounts.some((account) => account.id === newSupply.id)
      ? [...accounts, newSupply]
      : accounts;
  const form = useRef<HTMLFormElement>(null);
  const [accountId, setAccountId] = useState(
      initial?.account_id || accounts.find((a) => a.is_active)?.id || 0,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = supplies.find((a) => a.id === accountId),
    today = localToday();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
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
      <form
        ref={form}
        onSubmit={save}
        data-guard-changes
        onChange={markFormChanged}
      >
        <div className="form-grid">
          <div>
            <SearchSelect
              label="Servicio del recibo"
              required
              disabled={!!initial}
              options={supplies.map((account) => ({
                ...supplyOption(account),
                disabled: !account.is_active,
              }))}
              value={accountId || ""}
              onChange={(id) => setAccountId(Number(id))}
              placeholder="Buscar por suministro, proveedor o número de cuenta"
            />
            {!initial && createSupply && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding(true)}
              >
                + Registrar suministro
              </button>
            )}
          </div>
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
            onClick={(event) => {
              if (confirmFormDiscard(event.currentTarget.form)) onCancel();
            }}
          >
            Cancelar registro
          </button>
        </div>
      </form>
      {adding && createSupply && (
        <ContextDialog
          label="Registrar suministro para el recibo"
          onCancel={() => setAdding(false)}
        >
          <ServiceForm
            {...createSupply}
            initial={{}}
            onCancel={() => setAdding(false)}
            onSaved={async (account) => {
              setNewSupply(account);
              setAccountId(account.id);
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(false);
              createSupply.onAdded(account);
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

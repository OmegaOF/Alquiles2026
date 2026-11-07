import { useRef, useState } from "react";
import { api } from "../../api";
import type { Person } from "../../types";
import type { Contract } from "../../tenancy";
import type { Receipt } from "../../utilities";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { showDate } from "../../tenancy";
import {
  money,
  exactCents,
  exactAmount,
  financeToday,
  newFinanceKey,
} from "../../finances";
import type {
  FinanceData,
  FinanceCatalogs,
  FinanceResult,
  RentPreview,
  Movement,
  Expense,
  Obligation,
} from "../../finances";

type Action = { kind: string; id?: number };
export type FormProps = {
  base: string;
  action: Action;
  data: FinanceData;
  catalogs: FinanceCatalogs;
  people: Person[];
  units: { id: number; code: string; name: string }[];
  contracts: Contract[];
  receipts: Receipt[];
  admin: boolean;
  initialPersonId?: number;
  onSaved: () => Promise<void>;
  onCancel: () => void;
};
const amountInput = {
  type: "number",
  min: "0.01",
  step: "0.01",
  max: "999999999999.99",
  inputMode: "decimal" as const,
};
export function PersonChoice({
  people,
  name,
  label,
  value,
  onChange,
  optional = false,
}: {
  people: Person[];
  name: string;
  label: string;
  value?: number;
  onChange?: (id: number) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        required={!optional}
        defaultValue={onChange ? undefined : value || ""}
        value={onChange ? value || "" : undefined}
        onChange={
          onChange ? (e) => onChange(Number(e.target.value)) : undefined
        }
      >
        <option value="">
          {optional ? "Sin indicar" : "Seleccionar persona"}
        </option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CashFields({
  people,
  catalogs,
  currency,
  payer,
  beneficiary,
}: {
  people: Person[];
  catalogs: FinanceCatalogs;
  currency: string;
  payer?: number;
  beneficiary?: number;
}) {
  return (
    <>
      <Field label="Moneda">
        <input
          name="currency"
          defaultValue={currency}
          pattern="[A-Z]{3}"
          maxLength={3}
          required
        />
      </Field>
      <Field label="Importe del dinero realmente entregado">
        <input name="amount" {...amountInput} required />
      </Field>
      <Field label="Fecha del pago">
        <input
          type="date"
          name="occurred_on"
          defaultValue={financeToday()}
          required
        />
      </Field>
      <Field label="Método de pago">
        <select name="method_id" required>
          <option value="">Seleccionar método</option>
          {catalogs.methods
            .filter((x) => x.is_active)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </Field>
      <PersonChoice
        people={people}
        name="payer_id"
        label="Persona que entrega o paga el dinero"
        value={payer}
      />
      <PersonChoice
        people={people}
        name="beneficiary_person_id"
        label="Persona que recibe el dinero"
        value={beneficiary}
        optional
      />
      <Field label="Empresa u otro destinatario (si corresponde)">
        <input name="beneficiary_label" maxLength={160} />
      </Field>
      <Field label="Referencia de transferencia u operación (opcional)">
        <input name="reference" maxLength={160} />
      </Field>
      <Field label="Referencia del comprobante externo (opcional)">
        <input name="document_reference" maxLength={500} />
      </Field>
      <Field label="Observaciones (opcional)">
        <textarea name="notes" maxLength={3000} />
      </Field>
    </>
  );
}

function AllocationFields({
  obligations,
  sourceAvailable,
}: {
  obligations: Obligation[];
  sourceAvailable?: string;
}) {
  const [parts, setParts] = useState<Record<string, string>>({});
  const sum = Object.values(parts).reduce((a, b) => a + exactCents(b), 0n);
  return (
    <fieldset>
      <legend>Elige cuánto aplicar a cada concepto</legend>
      <p>
        Indica los importes expresamente. Un campo vacío no aplica dinero a ese
        concepto.
      </p>
      {obligations.map((o) => (
        <div className="utility-space" key={o.id}>
          <strong>
            {o.concept} · {showDate(o.period_start)} · pendiente{" "}
            {money(o.pending, o.currency)}
          </strong>
          <Field label={`Aplicar a ${o.concept} n.º ${o.id}`}>
            <input
              {...amountInput}
              min="0"
              max={o.pending}
              name={`apply_${o.id}`}
              value={parts[o.id] || ""}
              onChange={(e) => setParts({ ...parts, [o.id]: e.target.value })}
            />
          </Field>
          <p>
            Quedaría pendiente:{" "}
            {money(
              exactAmount(
                exactCents(o.pending) - exactCents(parts[o.id] || "0"),
              ),
              o.currency,
            )}
          </p>
        </div>
      ))}
      {!obligations.length && (
        <p>
          No hay obligaciones compatibles pendientes. Puedes registrar un
          anticipo explícito.
        </p>
      )}
      <p role="status">
        Total seleccionado: {exactAmount(sum)}
        {sourceAvailable ? ` · disponible: ${sourceAvailable}` : ""}
      </p>
    </fieldset>
  );
}

export function FinanceForm(p: FormProps) {
  const { action, data, catalogs, people, contracts, receipts, units } = p;
  const movement = data.movements.find((x) => x.id === action.id);
  const expense = data.expenses.find((x) => x.id === action.id);
  const obligation = data.obligations.find((x) => x.id === action.id);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<RentPreview | null>(null);
  const [personId, setPersonId] = useState(
      movement?.person_id || p.initialPersonId || 0,
    ),
    [currency, setCurrency] = useState(movement?.currency || "BOB"),
    [contractId, setContractId] = useState(contracts[0]?.id || 0),
    [receiptId, setReceiptId] = useState(
      receipts.find((r) => r.current_distribution_id)?.id || 0,
    ),
    [direct, setDirect] = useState(false);
  const requestKey = useRef(newFinanceKey());
  const titles: Record<string, string> = {
    rent: "Generar importes de alquiler",
    utility: "Importar reparto confirmado de servicios",
    provider: "Registrar gasto de recibo externo",
    receive: "Registrar pago recibido",
    guarantee: "Registrar garantía",
    expense: "Registrar gasto",
    pay: "Registrar pago realizado",
    apply: "Aplicar saldo disponible",
    refund: "Devolver saldo disponible",
    adjust: "Ajustar importe por cobrar",
    expenseAdjust: "Ajustar gasto registrado",
    void: "Anular pago para corregirlo",
    expenseVoid: "Anular gasto",
    applicationVoid: "Corregir aplicación",
    retain: "Retener garantía",
    catalog: "Métodos y categorías",
  };
  function formValues(form: HTMLFormElement) {
    const values = new FormData(form);
    const text = (key: string) => String(values.get(key) || "");
    const id = (key: string) => Number(values.get(key)) || null;
    const reason = text("reason") || null;
    const common = { request_key: requestKey.current, reason };
    const cash = {
      amount: text("amount"),
      currency: text("currency"),
      occurred_on: text("occurred_on"),
      method_id: id("method_id"),
      payer_id: id("payer_id"),
      beneficiary_person_id: id("beneficiary_person_id"),
      beneficiary_label: text("beneficiary_label") || null,
      reference: text("reference") || null,
      document_reference: text("document_reference") || null,
      notes: text("notes") || null,
    };
    const applications = Array.from(values.entries())
      .filter(
        ([key, value]) =>
          key.startsWith("apply_") && exactCents(String(value)) > 0n,
      )
      .map(([key, value]) => ({
        obligation_id: Number(key.slice(6)),
        amount: String(value),
      }));
    return { values, text, id, reason, common, cash, applications };
  }
  function rentalBody(form: HTMLFormElement) {
    const v = formValues(form);
    const c = contracts.find((c) => c.id === contractId);
    return {
      ...v.common,
      expected_version: c?.version,
      through: v.text("through"),
      weekly_partial_rule: v.text("weekly_partial_rule") || null,
      last_period_rule: v.text("last_period_rule") || null,
      due_on: v.text("due_on") || null,
      accept_context_change: v.values.has("accept_context_change"),
    };
  }
  async function showPreview(form: HTMLFormElement) {
    setError("");
    setBusy(true);
    try {
      setPreview(
        await api<RentPreview>(
          `${p.base}/contracts/${contractId}/preview`,
          "POST",
          rentalBody(form),
        ),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    let endpoint = "";
    let body: object = {};
    if (action.kind === "rent") {
      endpoint = `/contracts/${contractId}/generate`;
      body = rentalBody(form);
    }
    if (action.kind === "utility") {
      endpoint = `/receipts/${receiptId}/import`;
      body = {
        ...v.common,
        expected_distribution_id: receipts.find((r) => r.id === receiptId)
          ?.current_distribution_id,
        owner_person_id: v.id("owner_person_id"),
      };
    }
    if (action.kind === "provider") {
      endpoint = `/receipts/${receiptId}/expense`;
      body = {
        ...v.common,
        expected_version: receipts.find((r) => r.id === receiptId)?.version,
        owner_person_id: v.id("owner_person_id"),
      };
    }
    if (action.kind === "receive") {
      endpoint = "/receive";
      body = {
        ...v.common,
        ...v.cash,
        person_id: personId,
        surplus: v.text("surplus"),
        applications: v.applications,
      };
    }
    if (action.kind === "guarantee") {
      endpoint = "/guarantees";
      body = {
        ...v.common,
        ...v.cash,
        person_id: personId,
        contract_id: contractId,
        conditions: v.text("conditions"),
      };
    }
    if (action.kind === "expense") {
      endpoint = "/expenses";
      body = {
        ...v.common,
        person_id: v.id("person_id"),
        unit_id: v.id("unit_id"),
        category_id: v.id("category_id"),
        currency: v.text("currency"),
        amount: v.text("expense_amount"),
        description: v.text("description"),
        recorded_on: v.text("recorded_on"),
        due_on: v.text("due_on") || null,
        document_reference: v.text("expense_document") || null,
        notes: v.text("expense_notes") || null,
      };
    }
    if (action.kind === "pay") {
      endpoint = `/expenses/${action.id}/pay`;
      body = {
        ...v.common,
        ...v.cash,
        is_direct: direct,
        applications: direct ? v.applications : [],
      };
    }
    if (action.kind === "apply") {
      endpoint = "/apply";
      body = {
        ...v.common,
        authorize_guarantee:
          movement?.kind === "guarantee" && v.values.has("authorize_guarantee"),
        applications: v.applications.map((a) => ({
          ...a,
          source_movement_id: action.id,
        })),
      };
    }
    if (action.kind === "refund") {
      endpoint = `/movements/${action.id}/refund`;
      body = {
        ...v.common,
        ...v.cash,
        beneficiary_person_id: movement?.person_id,
      };
    }
    if (action.kind === "adjust" || action.kind === "expenseAdjust") {
      endpoint = `/${action.kind === "adjust" ? "obligations" : "expenses"}/${action.id}/adjust`;
      body = {
        ...v.common,
        new_total: v.text("new_total"),
        new_due_on: v.text("new_due_on") || null,
      };
    }
    if (action.kind === "void") {
      endpoint = `/movements/${action.id}/void`;
      body = v.common;
    }
    if (action.kind === "expenseVoid") {
      endpoint = `/expenses/${action.id}/void`;
      body = v.common;
    }
    if (action.kind === "applicationVoid") {
      endpoint = `/applications/${action.id}/void`;
      body = v.common;
    }
    if (action.kind === "retain") {
      endpoint = `/guarantees/${action.id}/retain`;
      body = v.common;
    }
    if (
      !window.confirm(
        `¿Confirmar: ${titles[action.kind]}? Revisa el importe, la moneda, las personas y los conceptos antes de continuar.`,
      )
    )
      return;
    setError("");
    setBusy(true);
    try {
      await api<FinanceResult>(p.base + endpoint, "POST", body);
      await p.onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const compatible = data.obligations.filter(
    (o) =>
      o.person_id ===
        (action.kind === "apply" ? movement?.person_id : personId) &&
      o.currency === (movement?.currency || currency) &&
      exactCents(o.pending) > 0n,
  );
  const c = contracts.find((c) => c.id === contractId);
  return (
    <section className="panel">
      <h2>{titles[action.kind]}</h2>
      <ErrorMessage message={error} />
      <form onSubmit={submit}>
        {["receive", "guarantee"].includes(action.kind) && (
          <PersonChoice
            people={people}
            name="person_id"
            label="Persona titular de la obligación o del saldo"
            value={personId}
            onChange={setPersonId}
          />
        )}
        {["rent", "guarantee"].includes(action.kind) && (
          <Field label="Contrato">
            <select
              name="contract_id"
              value={contractId || ""}
              required
              onChange={(e) => {
                setContractId(Number(e.target.value));
                setPreview(null);
              }}
            >
              <option value="">Seleccionar contrato</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  Contrato {c.id} · {c.target_label} ·{" "}
                  {people.find((p) => p.id === c.responsible_person_id)
                    ?.full_name || "Persona registrada"}{" "}
                  · {c.currency}
                </option>
              ))}
            </select>
          </Field>
        )}
        {action.kind === "rent" && (
          <>
            <p>
              Se utilizan las fechas, modalidad y precio del contrato. No se
              genera capital de anticrético.
            </p>
            <Field label="Generar periodos que comiencen hasta">
              <input
                name="through"
                type="date"
                required
                defaultValue={financeToday()}
                onChange={() => setPreview(null)}
              />
            </Field>
            <Field label="Regla pactada para un tramo semanal incompleto">
              <select
                name="weekly_partial_rule"
                onChange={() => setPreview(null)}
              >
                <option value="">Sin decisión adicional</option>
                <option value="proportional">
                  Proporcional expresamente acordado
                </option>
                <option value="full">Importe semanal completo acordado</option>
              </select>
            </Field>
            <Field label="Regla pactada para el último mes incompleto">
              <select name="last_period_rule" onChange={() => setPreview(null)}>
                <option value="">Pendiente de revisión</option>
                <option value="proportional">
                  Proporcional expresamente acordado
                </option>
                <option value="full">Importe mensual completo acordado</option>
              </select>
            </Field>
            <Field label="Vencimiento pactado si es personalizado">
              <input
                type="date"
                name="due_on"
                onChange={() => setPreview(null)}
              />
            </Field>
            {p.admin && (
              <label>
                <input type="checkbox" name="accept_context_change" /> Autorizar
                sustitución del responsable o moneda, conservando el historial
                anterior
              </label>
            )}
            <p>
              Primer periodo:{" "}
              {c?.first_period === "prorated"
                ? "proporcional según contrato"
                : "según contrato"}
              . Moneda: {c?.currency}.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy || !contractId}
              onClick={(e) => void showPreview(e.currentTarget.form!)}
            >
              Revisar importes
            </button>
            {preview && (
              <div className="utility-space">
                {preview.issues.map((s) => (
                  <p role="alert" key={s}>
                    {s}
                  </p>
                ))}
                {preview.periods.map((r) => (
                  <p key={r.start}>
                    {showDate(r.start)} al {showDate(r.end)}:{" "}
                    <strong>{money(r.amount, preview.currency)}</strong> · vence{" "}
                    {showDate(r.due_on)}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {(action.kind === "utility" || action.kind === "provider") && (
          <>
            {action.kind === "utility" && (
              <p>
                Se importa únicamente el reparto confirmado vigente. La parte
                del propietario no se convierte en deuda del inquilino.
              </p>
            )}
            {action.kind === "provider" && (
              <p>
                Puedes registrar y pagar el gasto antes de confirmar su reparto.
                No se crean deudas del inquilino en este paso.
              </p>
            )}
            <Field
              label={
                action.kind === "utility"
                  ? "Recibo de proveedor confirmado"
                  : "Recibo externo del proveedor"
              }
            >
              <select
                value={receiptId || ""}
                onChange={(e) => setReceiptId(Number(e.target.value))}
                required
              >
                <option value="">Seleccionar recibo</option>
                {receipts
                  .filter(
                    (r) =>
                      action.kind === "provider" || r.current_distribution_id,
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.account_label} · {money(r.amount, r.currency)} ·{" "}
                      {showDate(r.period_start)}
                    </option>
                  ))}
              </select>
            </Field>
            <PersonChoice
              people={people}
              name="owner_person_id"
              label="Responsable del registro del gasto del proveedor"
            />
          </>
        )}
        {["receive", "guarantee", "pay", "refund"].includes(action.kind) && (
          <CashFields
            key={`${action.kind}-${action.id || 0}-${currency}-${personId}`}
            people={people}
            catalogs={catalogs}
            currency={movement?.currency || expense?.currency || currency}
            payer={
              ["receive", "guarantee"].includes(action.kind)
                ? personId
                : undefined
            }
            beneficiary={
              action.kind === "refund" ? movement?.person_id : undefined
            }
          />
        )}
        {action.kind === "receive" && (
          <>
            <Field label="Moneda para seleccionar obligaciones">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {Array.from(
                  new Set([
                    "BOB",
                    "USD",
                    ...data.obligations.map((o) => o.currency),
                  ]),
                ).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <AllocationFields
              key={`${personId}-${currency}`}
              obligations={compatible}
            />
            <Field label="Si queda dinero sin aplicar">
              <select name="surplus">
                <option value="reject">Rechazar el sobrante</option>
                <option value="credit">
                  Registrar expresamente como saldo a favor
                </option>
                <option value="advance">
                  Registrar expresamente como anticipo
                </option>
              </select>
            </Field>
            <p>Aplicar este pago no registra una segunda entrada de dinero.</p>
          </>
        )}
        {action.kind === "guarantee" && (
          <>
            <Field label="Condiciones pactadas de la garantía">
              <textarea
                name="conditions"
                minLength={3}
                maxLength={3000}
                required
              />
            </Field>
            <p>
              La garantía queda separada del ingreso ordinario de alquiler y del
              capital de anticrético.
            </p>
          </>
        )}
        {action.kind === "expense" && (
          <>
            <PersonChoice
              people={people}
              name="person_id"
              label="Persona responsable del gasto"
            />
            <Field label="Cuarto (opcional)">
              <select name="unit_id">
                <option value="">Casa completa</option>
                {units.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categoría del gasto">
              <select name="category_id" required>
                <option value="">Seleccionar categoría</option>
                {catalogs.categories
                  .filter((x) => x.is_active)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Descripción del gasto">
              <input
                name="description"
                minLength={3}
                maxLength={250}
                required
              />
            </Field>
            <Field label="Importe del gasto registrado">
              <input name="expense_amount" {...amountInput} required />
            </Field>
            <Field label="Moneda">
              <input
                name="currency"
                defaultValue="BOB"
                pattern="[A-Z]{3}"
                required
              />
            </Field>
            <Field label="Fecha del gasto">
              <input
                name="recorded_on"
                type="date"
                defaultValue={financeToday()}
                required
              />
            </Field>
            <Field label="Fecha por pagar (opcional)">
              <input name="due_on" type="date" />
            </Field>
            <Field label="Referencia de comprobante del gasto (opcional)">
              <input name="expense_document" maxLength={500} />
            </Field>
            <Field label="Observaciones del gasto (opcional)">
              <textarea name="expense_notes" maxLength={3000} />
            </Field>
            <p>
              Registrar el gasto no significa que el dinero ya salió. El pago se
              registra cuando ocurra.
            </p>
          </>
        )}
        {action.kind === "pay" && (
          <>
            <p>
              {expense?.description} · pendiente{" "}
              {money(expense?.pending || "0", expense?.currency || "BOB")}
            </p>
            {expense?.receipt_id && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={direct}
                    onChange={(e) => setDirect(e.target.checked)}
                  />{" "}
                  El inquilino pagó directamente al proveedor, fuera de caja del
                  propietario
                </label>
                {direct && (
                  <>
                    <p>
                      Debe identificar al pagador real y el comprobante externo.
                      No se registra dinero recibido por el propietario.
                    </p>
                    <AllocationFields
                      obligations={data.obligations.filter(
                        (o) =>
                          o.receipt_id === expense.receipt_id &&
                          exactCents(o.pending) > 0n,
                      )}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
        {action.kind === "apply" && (
          <>
            <p>
              Saldo disponible:{" "}
              <strong>
                {money(movement?.available || "0", movement?.currency || "BOB")}
              </strong>
              . Aplicarlo no recibe dinero nuevo.
            </p>
            <AllocationFields
              obligations={compatible}
              sourceAvailable={movement?.available}
            />
            {movement?.kind === "guarantee" && (
              <label>
                <input type="checkbox" name="authorize_guarantee" required />{" "}
                Autorizo expresamente aplicar esta garantía al mismo contrato
              </label>
            )}
          </>
        )}
        {action.kind === "refund" && (
          <p>
            Disponible para devolver:{" "}
            {money(movement?.available || "0", movement?.currency || "BOB")}. La
            devolución se registra solo si realmente se entregó ese dinero al
            titular.
          </p>
        )}
        {["adjust", "expenseAdjust"].includes(action.kind) && (
          <>
            <p>
              Importe actual:{" "}
              {money(
                obligation?.total || expense?.total || "0",
                obligation?.currency || expense?.currency || "BOB",
              )}
              . El importe original permanece en el historial.
            </p>
            <Field label="Nuevo importe total exigible">
              <input name="new_total" {...amountInput} min="0" required />
            </Field>
            {action.kind === "adjust" && (
              <Field label="Nuevo vencimiento (opcional)">
                <input name="new_due_on" type="date" />
              </Field>
            )}
            <p>
              Si se reduce un importe ya cubierto, el exceso vuelve al saldo de
              su fuente original. No se inventa un cobro ni una devolución.
            </p>
          </>
        )}
        {action.kind === "void" && (
          <p>
            Se conservará el movimiento original y se revertirán sus
            aplicaciones. Para corregir su importe, registra después un pago
            nuevo por el importe correcto. Una anulación no representa una
            devolución de dinero.
          </p>
        )}
        <Field
          label={
            [
              "rent",
              "utility",
              "provider",
              "receive",
              "expense",
              "pay",
              "guarantee",
            ].includes(action.kind)
              ? "Motivo o decisión pactada (obligatorio para ajustes)"
              : "Motivo de la operación"
          }
        >
          <textarea
            name="reason"
            minLength={3}
            maxLength={3000}
            required={
              ![
                "rent",
                "utility",
                "provider",
                "receive",
                "expense",
                "pay",
                "guarantee",
              ].includes(action.kind)
            }
          />
        </Field>
        <div className="form-actions">
          <button
            disabled={
              busy ||
              (action.kind === "rent" &&
                (!preview || preview.issues.length > 0))
            }
          >
            {busy ? "Guardando…" : "Revisar y confirmar registro"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={p.onCancel}
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

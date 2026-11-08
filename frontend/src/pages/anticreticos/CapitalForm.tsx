import { useRef, useState } from "react";
import { api } from "../../api";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import type { Person } from "../../types";
import type { Catalog } from "../../finances";
import type { CapitalBook } from "../../anticreticos";
import {
  exactCents,
  exactAmount,
  money,
  newFinanceKey,
  financeToday,
} from "../../anticreticos";
type Row = {
  holder_id: string;
  responsible_id: string;
  amount: string;
  sign: string;
};
export function CapitalForm({
  book,
  people,
  methods,
  base,
  kind,
  targetId,
  onSaved,
  onCancel,
}: {
  book: CapitalBook;
  people: Person[];
  methods: Catalog[];
  base: string;
  kind:
    | "delivery"
    | "return"
    | "adjustment"
    | "void"
    | "voidAdjustment"
    | "extend";
  targetId?: number;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(""),
    [payer, setPayer] = useState(0),
    [beneficiary, setBeneficiary] = useState(0),
    [adjustKind, setAdjustKind] = useState("settlement"),
    [parts, setParts] = useState<Row[]>([
      {
        holder_id:
          book.holders.length === 1 ? String(book.holders[0].person_id) : "",
        responsible_id:
          book.responsibles.length === 1
            ? String(book.responsibles[0].person_id)
            : "",
        amount: "",
        sign: "-",
      },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requestKey = useRef(newFinanceKey());
  const name = (id: number) =>
    people.find((p) => p.id === id)?.full_name || "Pendiente de seleccionar";
  const cash = kind === "delivery" || kind === "return";
  const sum = parts.reduce(
    (v, p) =>
      v +
      exactCents(p.amount) *
        (kind === "adjustment" &&
        (adjustKind === "settlement" ||
          (adjustKind === "reassignment" && p.sign === "-"))
          ? -1n
          : 1n),
    0n,
  );
  const remaining =
    kind === "return"
      ? exactCents(book.capital_pending) - exactCents(amount)
      : kind === "adjustment"
        ? exactCents(book.capital_pending) + sum
        : exactCents(book.capital_pending) + exactCents(amount);
  const titles = {
    delivery: "Registrar entrega real de capital",
    return: "Registrar devolución real de capital",
    adjustment: "Registrar acuerdo de restitución",
    void: "Anular movimiento de capital",
    voidAdjustment: "Anular acuerdo de restitución",
    extend: "Prorrogar ocupación del contrato",
  };
  function update(index: number, patch: Partial<Row>) {
    setParts(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) || "");
    const reason = text("reason") || null;
    const common = {
      request_key: requestKey.current,
      expected_version: book.version,
      expected_contract_version: book.contract.version,
      reason,
    };
    let endpoint = "";
    let body: object = {};
    if (cash) {
      endpoint = kind === "delivery" ? "/deliveries" : "/returns";
      body = {
        ...common,
        amount,
        currency: book.currency,
        occurred_on: text("occurred_on"),
        method_id: Number(text("method_id")),
        payer_id: payer,
        beneficiary_person_id: beneficiary,
        reference: text("reference") || null,
        document_reference: text("document_reference") || null,
        notes: text("notes") || null,
        allocations: parts.map((p) => ({
          holder_id: Number(p.holder_id),
          responsible_id: Number(p.responsible_id),
          amount: p.amount,
        })),
      };
    }
    if (kind === "adjustment") {
      endpoint = "/adjustments";
      body = {
        ...common,
        kind: adjustKind,
        effective_on: text("effective_on"),
        document_reference: text("document_reference"),
        allocations: parts.map((p) => ({
          holder_id: Number(p.holder_id),
          responsible_id: Number(p.responsible_id),
          delta: exactAmount(
            exactCents(p.amount) *
              (adjustKind === "settlement" ||
              (adjustKind === "reassignment" && p.sign === "-")
                ? -1n
                : 1n),
          ),
        })),
      };
    }
    if (kind === "void") {
      endpoint = `/movements/${targetId}/void`;
      body = common;
    }
    if (kind === "voidAdjustment") {
      endpoint = `/adjustments/${targetId}/void`;
      body = common;
    }
    if (kind === "extend") {
      body = {
        action: "extend",
        expected_version: book.contract.version,
        end_date: text("end_date"),
        reason,
      };
    }
    const confirmation = cash
      ? `${titles[kind]}: ${money(amount, book.currency)}. Entrega/paga ${name(payer)} y recibe ${name(beneficiary)}. Pendiente antes: ${money(book.capital_pending, book.currency)}; después: ${money(exactAmount(remaining), book.currency)}. ¿Confirmar que el dinero realmente se entregó?`
      : `¿Confirmar ${titles[kind].toLowerCase()} con su motivo? Se conservará el historial.`;
    if (!window.confirm(confirmation)) return;
    setError("");
    setBusy(true);
    try {
      await api(
        kind === "extend"
          ? `/contracts/${book.contract.id}/actions`
          : base + endpoint,
        "POST",
        body,
      );
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function personSelect(label: string, id: number, set: (id: number) => void) {
    return (
      <Field label={label}>
        <select
          value={id || ""}
          onChange={(e) => set(Number(e.target.value))}
          required
        >
          <option value="">Seleccionar persona</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <section className="panel">
      <h2>{titles[kind]}</h2>
      <ErrorMessage message={error} />
      <form onSubmit={submit}>
        {cash && (
          <>
            <p>
              Registra solo dinero efectivamente entregado. El capital no es
              alquiler, garantía ni anticipo ordinario.
            </p>
            <Field
              label={
                kind === "delivery"
                  ? "Importe de capital entregado"
                  : "Importe de capital que se devuelve"
              }
            >
              <input
                type="number"
                min="0.01"
                max="999999999999.99"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <p>Moneda: {book.currency}</p>
            <Field label="Fecha real del movimiento">
              <input
                name="occurred_on"
                type="date"
                defaultValue={financeToday()}
                required
              />
            </Field>
            <Field label="Método de entrega o devolución">
              <select name="method_id" required>
                <option value="">Seleccionar método</option>
                {methods
                  .filter((m) => m.is_active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </Field>
            {personSelect(
              "Persona que efectivamente entrega o paga",
              payer,
              setPayer,
            )}
            {personSelect(
              "Persona que efectivamente recibe el dinero",
              beneficiary,
              setBeneficiary,
            )}
            <Field label="Referencia externa de transferencia (opcional)">
              <input name="reference" maxLength={160} />
            </Field>
            <Field label="Referencia del comprobante externo (opcional)">
              <input name="document_reference" maxLength={500} />
            </Field>
            <Field label="Observaciones del movimiento (opcional)">
              <textarea name="notes" maxLength={3000} />
            </Field>
          </>
        )}
        {kind === "adjustment" && (
          <>
            <p>
              Este acuerdo cambia la obligación de restitución. No registra
              dinero recibido o devuelto y no paga servicios automáticamente.
            </p>
            <Field label="Tipo de acuerdo de restitución">
              <select
                value={adjustKind}
                onChange={(e) => setAdjustKind(e.target.value)}
              >
                <option value="settlement">
                  Reducir restitución por acuerdo expreso
                </option>
                <option value="reassignment">
                  Reasignar entre personas, sin cambiar el total
                </option>
                <option value="additional">
                  Agregar otra obligación expresamente pactada
                </option>
              </select>
            </Field>
            <Field label="Fecha efectiva del acuerdo">
              <input
                name="effective_on"
                type="date"
                defaultValue={financeToday()}
                required
              />
            </Field>
            <Field label="Referencia del acuerdo externo autorizado">
              <input
                name="document_reference"
                minLength={3}
                maxLength={500}
                required
              />
            </Field>
          </>
        )}
        {(cash || kind === "adjustment") && (
          <fieldset>
            <legend>Asignaciones expresamente acordadas</legend>
            <p>
              Identifica el derecho del titular y la responsabilidad a la que
              corresponde cada parte. La persona que paga realmente puede ser
              otra.
            </p>
            {parts.map((p, index) => (
              <article className="utility-space" key={index}>
                <Field label={`Titular de la parte ${index + 1}`}>
                  <select
                    value={p.holder_id}
                    onChange={(e) =>
                      update(index, { holder_id: e.target.value })
                    }
                    required
                  >
                    <option value="">Seleccionar titular</option>
                    {book.holders.map((h) => (
                      <option key={h.person_id} value={h.person_id}>
                        {name(h.person_id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Responsable de la parte ${index + 1}`}>
                  <select
                    value={p.responsible_id}
                    onChange={(e) =>
                      update(index, { responsible_id: e.target.value })
                    }
                    required
                  >
                    <option value="">Seleccionar responsable</option>
                    {book.responsibles.map((r) => (
                      <option key={r.person_id} value={r.person_id}>
                        {name(r.person_id)}
                      </option>
                    ))}
                  </select>
                </Field>
                {kind === "adjustment" && adjustKind === "reassignment" && (
                  <Field label={`Cambio de la parte ${index + 1}`}>
                    <select
                      value={p.sign}
                      onChange={(e) => update(index, { sign: e.target.value })}
                    >
                      <option value="-">Reducir responsabilidad</option>
                      <option value="+">Aumentar responsabilidad</option>
                    </select>
                  </Field>
                )}
                <Field label={`Importe de la parte ${index + 1}`}>
                  <input
                    type="number"
                    min="0.01"
                    max="999999999999.99"
                    step="0.01"
                    value={p.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                    required
                  />
                </Field>
                <p>
                  Pendiente de esta pareja:{" "}
                  {money(
                    book.balances.find(
                      (b) =>
                        String(b.holder_id) === p.holder_id &&
                        String(b.responsible_id) === p.responsible_id,
                    )?.pending || "0",
                    book.currency,
                  )}
                </p>
                {kind === "return" && (
                  <p>
                    Persona autorizada a recibir:{" "}
                    {name(
                      book.holders.find(
                        (h) => String(h.person_id) === p.holder_id,
                      )?.beneficiary_person_id || 0,
                    )}
                  </p>
                )}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setParts(parts.filter((_, i) => i !== index))}
                >
                  Quitar parte {index + 1}
                </button>
              </article>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setParts([
                  ...parts,
                  { holder_id: "", responsible_id: "", amount: "", sign: "-" },
                ])
              }
            >
              Agregar parte
            </button>
            <p>
              Total asignado:{" "}
              <strong>{money(exactAmount(sum), book.currency)}</strong>
            </p>
          </fieldset>
        )}
        {kind === "extend" && (
          <>
            <p>
              La disponibilidad se verifica con las reglas de Contratos. Este
              paso no cambia la fecha pactada de restitución ni el capital.
            </p>
            <Field label="Nueva fecha final de ocupación">
              <input name="end_date" type="date" required />
            </Field>
          </>
        )}
        {(kind === "void" || kind === "voidAdjustment") && (
          <p>
            La operación original queda en el historial. Si la anulación
            produciría saldos incompatibles, deberá corregir primero las
            operaciones relacionadas. Una anulación no afirma una nueva entrega
            de dinero.
          </p>
        )}
        {(cash || kind === "adjustment") && (
          <section className="utility-space" aria-label="Revisión del capital">
            <h3>Revisar antes de confirmar</h3>
            <p>
              Capital pendiente antes:{" "}
              <strong>{money(book.capital_pending, book.currency)}</strong>
            </p>
            {cash && (
              <p>
                Importe real: {money(amount || "0", book.currency)} ·{" "}
                {name(payer)} entrega/paga a {name(beneficiary)}.
              </p>
            )}
            <p>
              Capital pendiente después:{" "}
              <strong>{money(exactAmount(remaining), book.currency)}</strong>
            </p>
            <p>
              La ocupación y los servicios básicos conservan sus propios
              estados.
            </p>
          </section>
        )}
        <Field
          label={
            cash ? "Motivo del movimiento (opcional)" : "Motivo y autorización"
          }
        >
          <textarea
            name="reason"
            minLength={3}
            maxLength={3000}
            required={!cash}
          />
        </Field>
        <div className="form-actions">
          <button disabled={busy}>
            {busy
              ? "Guardando…"
              : cash
                ? "Confirmar movimiento real"
                : "Revisar y confirmar acuerdo"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

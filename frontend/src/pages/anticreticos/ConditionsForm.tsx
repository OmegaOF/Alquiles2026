import { useRef, useState } from "react";
import { api } from "../../api";
import {
  Field,
  ErrorMessage,
  errorText,
  confirmFormDiscard,
  markFormChanged,
} from "../../components/Form";
import { SearchSelect, personOption } from "../../components/SearchSelect";
import { ContextDialog } from "../../components/ContextDialog";
import { NewContact } from "../tenancy/Shared";
import type { Person } from "../../types";
import type { CapitalBook } from "../../anticreticos";
import {
  exactCents,
  exactAmount,
  money,
  newFinanceKey,
} from "../../anticreticos";
import { showDate } from "../../tenancy";

type Row = {
  person_id: string;
  beneficiary_person_id: string;
  assigned_amount: string;
};
const blank = (): Row => ({
  person_id: "",
  beneficiary_person_id: "",
  assigned_amount: "",
});
export function ConditionsForm({
  book,
  people,
  propertyId = book.contract.resolved_property_id,
  onAdded,
  base,
  onSaved,
  onCancel,
}: {
  book: CapitalBook;
  people: Person[];
  propertyId?: number;
  onAdded?: () => void;
  base: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [adding, setAdding] = useState<{
    index: number;
    kind: "holders" | "responsibles";
    field: "person_id" | "beneficiary_person_id";
  }>();
  const [added, setAdded] = useState<Person[]>([]);
  const options = [
    ...people,
    ...added.filter((person) => !people.some((item) => item.id === person.id)),
  ].map(personOption);
  const form = useRef<HTMLFormElement>(null);
  const prior = book.conditions;
  const [agreed, setAgreed] = useState(prior?.agreed_capital || ""),
    [holders, setHolders] = useState<Row[]>(
      prior?.holders.map((h) => ({
        person_id: String(h.person_id),
        beneficiary_person_id: h.beneficiary_person_id
          ? String(h.beneficiary_person_id)
          : "",
        assigned_amount: h.assigned_amount,
      })) || [blank()],
    ),
    [responsibles, setResponsibles] = useState<Row[]>(
      prior?.responsibles.map((r) => ({
        person_id: String(r.person_id),
        beneficiary_person_id: "",
        assigned_amount: r.assigned_amount,
      })) || [blank()],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requestKey = useRef(newFinanceKey());
  const sum = (rows: Row[]) =>
    rows.reduce((total, r) => total + exactCents(r.assigned_amount), 0n);
  function rows(
    kind: "holders" | "responsibles",
    items: Row[],
    set: (rows: Row[]) => void,
  ) {
    return (
      <fieldset>
        <legend>
          {kind === "holders"
            ? "2. Titulares y personas autorizadas a recibir"
            : "3. Responsables de devolver el capital"}
        </legend>
        <p>
          Escribe los importes pactados. No se usan las participaciones de
          propiedad ni se supone un reparto por mitades.
        </p>
        {items.map((r, index) => (
          <div className="utility-space" key={index}>
            <SearchSelect
              label={`${kind === "holders" ? "Titular" : "Responsable"} ${index + 1}`}
              options={options}
              required
              value={r.person_id}
              onChange={(id) =>
                set(
                  items.map((item, i) =>
                    i === index ? { ...item, person_id: id } : item,
                  ),
                )
              }
            />
            <button
              type="button"
              className="secondary"
              onClick={() => setAdding({ kind, index, field: "person_id" })}
            >
              + Registrar {kind === "holders" ? "titular" : "responsable"}
            </button>
            {kind === "holders" && (
              <>
                <SearchSelect
                  label={`Persona autorizada a recibir por titular ${index + 1}`}
                  options={options}
                  value={r.beneficiary_person_id}
                  onChange={(id) =>
                    set(
                      items.map((item, i) =>
                        i === index
                          ? { ...item, beneficiary_person_id: id }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setAdding({ kind, index, field: "beneficiary_person_id" })
                  }
                >
                  + Registrar persona autorizada
                </button>
              </>
            )}
            <Field
              label={`Importe acordado de ${kind === "holders" ? "titular" : "responsable"} ${index + 1}`}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                max="999999999999.99"
                value={r.assigned_amount}
                required
                onChange={(e) =>
                  set(
                    items.map((v, i) =>
                      i === index
                        ? { ...v, assigned_amount: e.target.value }
                        : v,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="text-button"
              onClick={() => set(items.filter((_, i) => i !== index))}
            >
              Quitar {kind === "holders" ? "titular" : "responsable"}{" "}
              {index + 1}
            </button>
          </div>
        ))}
        <p>
          Total de {kind === "holders" ? "titulares" : "responsables"}:{" "}
          <strong>{money(exactAmount(sum(items)), book.currency)}</strong> ·
          capital acordado {money(agreed || "0", book.currency)}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => set([...items, blank()])}
        >
          Agregar {kind === "holders" ? "titular" : "responsable"}
        </button>
        {!items.length && (
          <p>
            Estos datos quedarán pendientes. No se permitirán movimientos hasta
            completarlos.
          </p>
        )}
      </fieldset>
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) || "");
    if (
      !window.confirm(
        `¿Guardar el capital acordado de ${money(agreed, book.currency)} y estas asignaciones? Esto no registra dinero recibido ni modifica la ocupación.`,
      )
    )
      return;
    setError("");
    setBusy(true);
    try {
      await api(`${base}/conditions`, "POST", {
        request_key: requestKey.current,
        expected_version: book.version,
        expected_contract_version: book.contract.version,
        agreed_capital: agreed,
        expected_delivery_on: text("expected_delivery_on") || null,
        restitution_on: text("restitution_on") || null,
        allow_early_return: values.has("allow_early_return"),
        conditions: text("conditions"),
        document_reference: text("document_reference") || null,
        notes: text("notes") || null,
        reason: text("reason") || null,
        acknowledge_received_excess: values.has("acknowledge_received_excess"),
        holders: holders.map((h) => ({
          person_id: Number(h.person_id),
          beneficiary_person_id: Number(h.beneficiary_person_id) || null,
          assigned_amount: h.assigned_amount,
        })),
        responsibles: responsibles.map((r) => ({
          person_id: Number(r.person_id),
          assigned_amount: r.assigned_amount,
        })),
      });
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>
        {prior
          ? "Modificar condiciones del capital"
          : "Completar capital acordado"}
      </h2>
      <p>
        Contrato {book.contract.id}: {showDate(book.contract.start_date)} al{" "}
        {showDate(book.contract.end_date)}. Moneda contractual: {book.currency}.
      </p>
      <p>
        El acuerdo no demuestra una entrega de dinero. Los cambios conservan las
        versiones anteriores y no trasladan responsabilidades automáticamente.
      </p>
      <ErrorMessage message={error} />
      <form
        ref={form}
        onSubmit={submit}
        data-guard-changes
        onChange={markFormChanged}
      >
        <fieldset>
          <legend>1. Capital y fechas pactadas</legend>
          <Field label="Capital total acordado">
            <input
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={agreed}
              onChange={(e) => setAgreed(e.target.value)}
              required
            />
          </Field>
          <Field label="Fecha prevista de entrega del capital">
            <input
              name="expected_delivery_on"
              type="date"
              defaultValue={prior?.expected_delivery_on || ""}
            />
          </Field>
          <Field label="Fecha pactada de restitución">
            <input
              name="restitution_on"
              type="date"
              defaultValue={prior?.restitution_on || ""}
            />
          </Field>
          <label>
            <input
              name="allow_early_return"
              type="checkbox"
              defaultChecked={prior?.allow_early_return || false}
            />{" "}
            El acuerdo permite devolver antes de la fecha pactada
          </label>
        </fieldset>
        {rows("holders", holders, setHolders)}
        {rows("responsibles", responsibles, setResponsibles)}
        <fieldset>
          <legend>4. Condiciones y respaldo del acuerdo</legend>
          <Field label="Condiciones particulares pactadas">
            <textarea
              name="conditions"
              defaultValue={prior?.conditions || ""}
              minLength={3}
              maxLength={5000}
              required
            />
          </Field>
          <Field label="Referencia del documento externo">
            <input
              name="document_reference"
              defaultValue={prior?.document_reference || ""}
              minLength={prior ? 3 : undefined}
              maxLength={500}
              required={!!prior}
            />
          </Field>
          <Field label="Observaciones del capital (opcional)">
            <textarea
              name="notes"
              defaultValue={prior?.notes || ""}
              maxLength={3000}
            />
          </Field>
          {prior && (
            <Field label="Motivo de la modificación">
              <textarea name="reason" minLength={3} maxLength={3000} required />
            </Field>
          )}
          {exactCents(agreed) < exactCents(book.capital_received) && (
            <label>
              <input
                type="checkbox"
                name="acknowledge_received_excess"
                required
              />{" "}
              Reconozco que el dinero ya recibido supera el nuevo capital
              acordado. El efectivo registrado y la restitución no cambian por
              este paso.
            </label>
          )}
        </fieldset>
        <div className="form-actions">
          <button disabled={busy}>
            {busy ? "Guardando…" : "Revisar y guardar condiciones"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={(event) => {
              if (confirmFormDiscard(event.currentTarget.form)) onCancel();
            }}
            disabled={busy}
          >
            Cancelar
          </button>
        </div>
      </form>
      {adding && (
        <ContextDialog
          label="Registrar persona para el anticrético"
          onCancel={() => setAdding(undefined)}
        >
          <NewContact
            propertyId={propertyId}
            onCancel={() => setAdding(undefined)}
            onAdded={async (person) => {
              setAdded((current) => [...current, person]);
              const update =
                adding.kind === "holders" ? setHolders : setResponsibles;
              update((current) =>
                current.map((row, index) =>
                  index === adding.index
                    ? { ...row, [adding.field]: String(person.id) }
                    : row,
                ),
              );
              if (form.current) form.current.dataset.dirty = "true";
              setAdding(undefined);
              onAdded?.();
            }}
          />
        </ContextDialog>
      )}
    </section>
  );
}

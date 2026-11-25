import {
  RecordCollection,
  RecordField,
  RecordRow,
} from "../../components/RecordList";
import { RecordStatus } from "../../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { SearchSelect, personOption } from "../../components/SearchSelect";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import type { Person } from "../../types";
import type { FinanceData, FinanceCatalogs } from "../../finances";
import type { ReportedPayment } from "../../reminders";
import {
  money,
  exactCents,
  newFinanceKey,
  showDate,
  reportStates,
} from "../../reminders";

export function PaymentReports({
  base,
  propertyId,
  people,
  admin,
  canWrite,
  today,
  onFinances,
}: {
  base: string;
  propertyId: number;
  people: Person[];
  admin: boolean;
  canWrite: boolean;
  today: string;
  onFinances: () => void;
}) {
  const [items, setItems] = useState<ReportedPayment[]>([]),
    [finance, setFinance] = useState<FinanceData | null>(null),
    [catalogs, setCatalogs] = useState<FinanceCatalogs>({
      methods: [],
      categories: [],
    }),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<ReportedPayment | null>(null),
    [obligationId, setObligationId] = useState(0),
    [decision, setDecision] = useState("verified"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const requestKey = useRef(newFinanceKey());
  const personName = (id: number) =>
    people.find((p) => p.id === id)?.full_name ||
    `Persona registrada n.º ${id}`;
  async function load() {
    const [r, f, c] = await Promise.all([
      api<ReportedPayment[]>(base + "/payment-reports"),
      api<FinanceData>(`/properties/${propertyId}/finances`),
      api<FinanceCatalogs>("/finances/catalogs"),
    ]);
    setItems(r);
    setFinance(f);
    setCatalogs(c);
    if (selected) setSelected(r.find((v) => v.id === selected.id) || null);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, [base]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      str = (k: string) => String(form.get(k) || "");
    if (
      !window.confirm(
        "¿Registrar lo que informa esta persona? El reporte quedará pendiente: no reduce deudas ni confirma dinero recibido.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(base + "/payment-reports", "POST", {
        request_key: requestKey.current,
        obligation_id: obligationId || null,
        person_id: obligationId ? null : Number(str("person_id")),
        currency: obligationId ? null : str("currency"),
        reporting_person_id: Number(str("reporting_person_id")),
        concept: str("concept"),
        amount: str("amount"),
        reported_on: str("reported_on"),
        method_id: Number(str("method_id")),
        document_reference: str("document_reference"),
        notes: str("notes") || null,
      });
      setCreating(false);
      await load();
      requestKey.current = newFinanceKey();
      setNotice(
        "Reporte guardado como información pendiente. El dinero y la deuda no cambiaron.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const values = new FormData(e.currentTarget);
    if (
      !window.confirm(
        decision === "verified"
          ? "¿Vincular este reporte con el ingreso real seleccionado? Comprueba importe, moneda, método y aplicación. No se creará otra entrada de dinero."
          : "¿Registrar esta decisión con su motivo? El historial y la deuda se conservarán.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/payment-reports/${selected.id}/decisions`, "POST", {
        request_key: requestKey.current,
        expected_version: selected.version,
        action: decision,
        movement_id:
          decision === "verified" ? Number(values.get("movement_id")) : null,
        reason: String(values.get("reason")),
      });
      await load();
      requestKey.current = newFinanceKey();
      setNotice("Decisión registrada con historial. No se creó dinero nuevo.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function personSelect(label: string, name: string) {
    return (
      <SearchSelect
        label={label}
        name={name}
        required
        options={people.map(personOption)}
      />
    );
  }
  const candidates = selected
    ? (finance?.movements || []).filter(
        (m) =>
          ["received", "advance"].includes(m.kind) &&
          !m.void_operation_id &&
          m.person_id === selected.person_id &&
          m.currency === selected.currency &&
          m.method_id === selected.method_id &&
          exactCents(m.amount) === exactCents(selected.amount),
      )
    : [];
  return (
    <section>
      <h2>Pagos reportados y verificación</h2>
      <p>
        Que una persona informe un pago no confirma su recepción. Registra el
        ingreso real mediante Pagos y gastos y después vincúlalo aquí, o
        selecciona uno que ya exista.
      </p>
      <ErrorMessage message={error} />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="form-actions">
        {canWrite && (
          <button
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setObligationId(0);
              requestKey.current = newFinanceKey();
            }}
          >
            Registrar pago reportado
          </button>
        )}
        <button className="secondary" onClick={onFinances}>
          Abrir Pagos y gastos de esta casa
        </button>
      </div>
      {creating && (
        <form className="panel" onSubmit={(e) => void save(e)}>
          <h3>Registrar información de pago</h3>
          <SearchSelect
            label="Obligación relacionada con el reporte"
            value={obligationId || ""}
            hint="Si queda vacía, indica la persona y la moneda del concepto."
            onChange={(id) => setObligationId(Number(id))}
            options={(finance?.obligations || [])
              .filter((obligation) => exactCents(obligation.pending) > 0n)
              .map((obligation) => ({
                value: obligation.id,
                label: `${obligation.concept} · ${personName(obligation.person_id)} · ${money(obligation.pending, obligation.currency)}`,
              }))}
          />
          {!obligationId && (
            <>
              {personSelect("Persona responsable del concepto", "person_id")}
              <Field label="Moneda del importe reportado">
                <select name="currency">
                  <option>BOB</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </Field>
            </>
          )}
          {personSelect(
            "Persona que informa haber pagado",
            "reporting_person_id",
          )}
          <Field label="Concepto informado">
            <input name="concept" minLength={3} maxLength={250} required />
          </Field>
          <Field label="Importe reportado, todavía sin confirmar">
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max="999999999999.99"
              required
            />
          </Field>
          <Field label="Fecha que comunica la persona">
            <input
              name="reported_on"
              type="date"
              defaultValue={today}
              max={today}
              required
            />
          </Field>
          <Field label="Método de pago informado">
            <select name="method_id" required>
              <option value="">Seleccionar método</option>
              {catalogs.methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referencia del comprobante reportado">
            <input
              name="document_reference"
              minLength={3}
              maxLength={500}
              required
            />
          </Field>
          <Field label="Observaciones del reporte">
            <textarea name="notes" maxLength={1000} />
          </Field>
          <div className="form-actions">
            <button disabled={busy}>Guardar reporte pendiente</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setCreating(false)}
              disabled={busy}
            >
              Cancelar reporte
            </button>
          </div>
        </form>
      )}
      <RecordCollection
        id={`${base}:reported-payments`}
        label="pagos reportados"
        items={items}
        searchable={(r) =>
          `${r.id} ${r.concept} ${personName(r.person_id)} ${personName(r.reporting_person_id)} ${r.reported_on} ${money(r.amount, r.currency)} ${r.document_reference} ${reportStates[r.state]}`
        }
        filter={{
          label: "Estado de verificación",
          value: (r) => reportStates[r.state],
        }}
        empty="No hay pagos reportados en esta consulta."
        render={(r) => (
          <RecordRow
            key={r.id}
            title={r.concept}
            fields={
              <>
                <RecordField label="Responsable">
                  {personName(r.person_id)}
                </RecordField>
                <RecordField label="Informó">
                  {personName(r.reporting_person_id)}
                </RecordField>
                <RecordField label="Importe reportado">
                  {money(r.amount, r.currency)}
                </RecordField>
                <RecordField label="Fecha comunicada">
                  {showDate(r.reported_on)}
                </RecordField>
                <RecordField label="Estado">
                  <RecordStatus domain="paymentReport" state={r.state} />
                </RecordField>
              </>
            }
            actions={
              <button
                className="secondary"
                onClick={() => {
                  setSelected(r);
                  setCreating(false);
                  setDecision(admin ? "verified" : "pending");
                  requestKey.current = newFinanceKey();
                }}
              >
                Revisar reporte {r.id}
              </button>
            }
          />
        )}
      />
      {selected && (
        <section className="panel">
          <h3>Revisión del reporte {selected.id}</h3>
          <p>
            {selected.concept} · {money(selected.amount, selected.currency)} ·{" "}
            <RecordStatus domain="paymentReport" state={selected.state} />
          </p>
          <p>
            Comprobante externo: {selected.document_reference}. Registró usuario{" "}
            {selected.recorded_by}. Un reporte verificado se vincula a una
            entrada existente; si esa entrada se anula, vuelve a requerir
            revisión.
          </p>
          {canWrite &&
            (admin || selected.state === "reported") &&
            ["reported", "pending", "verification_invalid"].includes(
              selected.state,
            ) && (
              <form onSubmit={(e) => void decide(e)}>
                <Field label="Decisión sobre el reporte">
                  <select
                    value={decision}
                    onChange={(e) => {
                      setDecision(e.target.value);
                      requestKey.current = newFinanceKey();
                    }}
                  >
                    {admin && (
                      <>
                        <option value="verified">
                          Verificar y vincular ingreso real
                        </option>
                        <option value="rejected">Rechazar con motivo</option>
                      </>
                    )}
                    <option value="pending">
                      Mantener pendiente de verificación
                    </option>
                  </select>
                </Field>
                {decision === "verified" && (
                  <>
                    <SearchSelect
                      label="Ingreso real que corresponde al comprobante"
                      name="movement_id"
                      required
                      options={candidates.map((movement) => ({
                        value: movement.id,
                        label: `${money(movement.amount, movement.currency)} · ${showDate(movement.occurred_on)} · ${movement.reference || "Sin referencia externa"}`,
                      }))}
                    />
                    <p>
                      Se muestran ingresos vigentes del mismo titular, importe,
                      método y moneda. Si el reporte corresponde a una
                      obligación, su aplicación también debe cubrirlo.
                    </p>
                    {!candidates.length && (
                      <p>
                        No hay un ingreso coincidente. Regístralo o corrige su
                        aplicación en Pagos y gastos; no lo dupliques si ya
                        existe.
                      </p>
                    )}
                  </>
                )}
                <Field label="Motivo de la decisión">
                  <textarea
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </Field>
                <button disabled={busy}>Revisar y confirmar decisión</button>
              </form>
            )}
          <h4>Historial de verificación</h4>
          <RecordCollection
            id={`${base}:reported-payments:${selected.id}:decisions`}
            label="decisiones de verificación"
            items={selected.decisions}
            searchable={(d) =>
              `${reportStates[d.kind]} ${d.reason} ${d.created_by} ${d.movement_id ?? ""}`
            }
            render={(d) => (
              <RecordRow
                key={d.id}
                title={<RecordStatus domain="paymentReport" state={d.kind} />}
                fields={
                  <>
                    <RecordField label="Usuario">{d.created_by}</RecordField>
                    {d.movement_id && (
                      <RecordField label="Movimiento real">
                        {d.movement_id}
                      </RecordField>
                    )}
                  </>
                }
                detail={<p>{d.reason}</p>}
                detailLabel="Ver motivo"
              />
            )}
          />
        </section>
      )}
    </section>
  );
}

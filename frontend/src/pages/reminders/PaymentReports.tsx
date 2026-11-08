import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
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
      <Field label={label}>
        <select name={name} required>
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
          <Field label="Obligación relacionada con el reporte">
            <select
              value={obligationId || ""}
              onChange={(e) => setObligationId(Number(e.target.value))}
            >
              <option value="">Otro concepto: indicar persona y moneda</option>
              {(finance?.obligations || [])
                .filter((o) => exactCents(o.pending) > 0n)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.concept} · {personName(o.person_id)} ·{" "}
                    {money(o.pending, o.currency)} · n.º {o.id}
                  </option>
                ))}
            </select>
          </Field>
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
      {items.map((r) => (
        <article className="panel" key={r.id}>
          <h3>
            {r.concept} · {reportStates[r.state]}
          </h3>
          <p>
            Responsable: {personName(r.person_id)} · Informó:{" "}
            {personName(r.reporting_person_id)}
          </p>
          <p>
            Importe reportado: <strong>{money(r.amount, r.currency)}</strong> ·
            Fecha comunicada: {showDate(r.reported_on)}
          </p>
          <p>Comprobante externo: {r.document_reference}</p>
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
        </article>
      ))}
      {!items.length && <p>No hay pagos reportados en esta casa.</p>}
      {selected && (
        <section className="panel">
          <h3>Revisión del reporte {selected.id}</h3>
          <p>
            {selected.concept} · {money(selected.amount, selected.currency)} ·{" "}
            {reportStates[selected.state]}
          </p>
          <p>
            Registró usuario {selected.recorded_by}. Un reporte verificado se
            vincula a una entrada existente; si esa entrada se anula, vuelve a
            requerir revisión.
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
                    <Field label="Ingreso real que corresponde al comprobante">
                      <select name="movement_id" required>
                        <option value="">Seleccionar movimiento real</option>
                        {candidates.map((m) => (
                          <option key={m.id} value={m.id}>
                            Movimiento {m.id} · {money(m.amount, m.currency)} ·{" "}
                            {showDate(m.occurred_on)} ·{" "}
                            {m.reference || "Sin referencia externa"}
                          </option>
                        ))}
                      </select>
                    </Field>
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
          {selected.decisions.map((d) => (
            <p key={d.id}>
              {reportStates[d.kind]} · {d.reason} · Usuario {d.created_by}
              {d.movement_id && ` · Movimiento real ${d.movement_id}`}
            </p>
          ))}
        </section>
      )}
    </section>
  );
}

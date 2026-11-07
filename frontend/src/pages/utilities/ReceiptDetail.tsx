import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Person, User } from "../../types";
import type {
  Receipt,
  ServiceAccount,
  Distribution,
  ReceiptHistory,
} from "../../utilities";
import {
  configFields,
  distributionStates,
  methods,
  money,
} from "../../utilities";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { showDate } from "../../tenancy";
import { ConfigurationFields } from "./ConfigurationFields";
import { ResolutionForm } from "./ResolutionForm";
import { ReceiptForm } from "./ReceiptForm";

type Props = {
  initial: Receipt;
  accounts: ServiceAccount[];
  people: Person[];
  units: { id: number; code: string; name: string }[];
  user: User;
  reload: () => Promise<void>;
  onBack: () => void;
};
export function ReceiptDetail({
  initial,
  accounts,
  people,
  units,
  user,
  reload,
  onBack,
}: Props) {
  const [receipt, setReceipt] = useState(initial),
    [dist, setDist] = useState<Distribution | null>(null),
    [history, setHistory] = useState<ReceiptHistory | null>(null),
    [calculating, setCalculating] = useState(!initial.latest_distribution_id),
    [resolving, setResolving] = useState(false),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const account = accounts.find((a) => a.id === receipt.account_id)!;
  const canWrite = user.role !== "owner",
    canConfirm =
      user.role === "general_admin" || user.role === "property_admin";
  const [config, setConfig] = useState(configFields(account.configuration)),
    [adjustment, setAdjustment] = useState(false),
    [reason, setReason] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  const personName = (id: number | null) =>
    people.find((p) => p.id === id)?.full_name ||
    (id ? `Persona registrada n.º ${id}` : "Pendiente de seleccionar");
  async function load(selected?: Distribution) {
    const r = await api<Receipt>(`/utility-receipts/${receipt.id}`);
    const h = await api<ReceiptHistory>(
      `/utility-receipts/${receipt.id}/history`,
    );
    const d =
      selected ||
      h.distributions.find((d) => d.id === r.latest_distribution_id) ||
      null;
    setReceipt(r);
    setHistory(h);
    setDist(d);
  }
  useEffect(() => {
    let valid = true;
    load().catch((e) => {
      if (valid) setError(errorText(e));
    });
    return () => {
      valid = false;
    };
  }, [initial.id]);
  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "¿Calcular el reparto para revisarlo? No se registra un pago ni una deuda.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let currentAccount = account;
      if (
        JSON.stringify(configFields(account.configuration)) !==
        JSON.stringify(config)
      ) {
        currentAccount = await api<ServiceAccount>(
          `/service-accounts/${account.id}/configurations`,
          "POST",
          { ...config, expected_version: account.version },
        );
        await reload();
      }
      const result = await api<Distribution>(
        `/utility-receipts/${receipt.id}/calculate`,
        "POST",
        {
          expected_version: receipt.version,
          configuration_id: currentAccount.configuration.id,
          request_key: crypto.randomUUID().replaceAll("-", ""),
          adjustment,
          reason: reason || null,
          manual_amounts:
            config.method === "manual"
              ? (config.unit_ids.length ? config.unit_ids : [null]).map(
                  (unit_id) => ({
                    unit_id,
                    amount: manual[String(unit_id)] || "0",
                  }),
                )
              : [],
        },
      );
      await load(result);
      await reload();
      setCalculating(false);
      setNotice(
        result.status === "needs_review"
          ? "El cálculo requiere revisión antes de confirmarse."
          : "Reparto calculado. Revísalo antes de confirmar.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (
      !dist ||
      !window.confirm(
        `¿Confirmar que se distribuyen ${money(dist.receipt.amount, dist.receipt.currency)} entre estas personas? Esta aprobación no registra un pago ni un reintegro.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Distribution>(
        `/utility-distributions/${dist.id}/confirm`,
        "POST",
        {
          expected_version: dist.version,
          expected_receipt_version: dist.receipt_version,
        },
      );
      await load(result);
      await reload();
      setNotice(
        "Distribución confirmada. No significa que el recibo esté pagado ni que se hayan recuperado importes.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (editing)
    return (
      <ReceiptForm
        accounts={accounts}
        initial={receipt}
        onCancel={() => setEditing(false)}
        onSaved={async (r) => {
          await reload();
          setReceipt(r);
          await load();
          setEditing(false);
          setCalculating(true);
          setAdjustment(!!r.current_distribution_id);
          setNotice(
            "Corrección del recibo registrada. Se conservan los importes y repartos anteriores.",
          );
        }}
      />
    );
  if (resolving && dist)
    return (
      <ResolutionForm
        distribution={dist}
        people={people}
        onCancel={() => setResolving(false)}
        onSaved={async (d) => {
          await load(d);
          await reload();
          setResolving(false);
          setNotice(
            "Revisión manual guardada con su motivo. Comprueba el resumen antes de confirmar.",
          );
        }}
      />
    );
  return (
    <section>
      <button className="text-button" onClick={onBack}>
        ← Volver a recibos
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            RECIBO DEL PROVEEDOR ·{" "}
            {receipt.external_reference || "Sin referencia externa"}
          </p>
          <h2>
            {receipt.account_label}: {money(receipt.amount, receipt.currency)}
          </h2>
          <p>
            Proveedor: {receipt.provider} · Periodo{" "}
            {showDate(receipt.period_start)} al {showDate(receipt.period_end)}
          </p>
        </div>
        {canWrite && (
          <button
            className="secondary"
            disabled={
              busy ||
              (user.role === "operator" && !!receipt.current_distribution_id)
            }
            onClick={() => setEditing(true)}
          >
            Corregir recibo registrado
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      <div className="panel">
        <h3>Datos del recibo existente</h3>
        <p>
          Emisión externa: {showDate(receipt.issued_on)} · Fecha límite de pago:{" "}
          {showDate(receipt.due_on)}
        </p>
        <p>
          Referencia del comprobante externo:{" "}
          {receipt.document_reference || "Sin referencia adicional"}
        </p>
        {receipt.consumption && (
          <p>
            Consumo indicado: {receipt.consumption} {account.measure_unit}
          </p>
        )}
        <p>
          Componente fijo incluido:{" "}
          {money(receipt.fixed_amount, receipt.currency)}
        </p>
        <p>Observaciones: {receipt.notes || "Sin observaciones."}</p>
        <p className="permission-note">
          Recibo registrado; no se ha registrado un pago ni un reintegro
          efectivo.
        </p>
      </div>
      {canWrite && !calculating && (
        <button
          disabled={busy}
          className="secondary"
          onClick={() => {
            setCalculating(true);
            setAdjustment(!!receipt.current_distribution_id);
            setReason("");
            setConfig(configFields(account.configuration));
          }}
        >
          {" "}
          {receipt.current_distribution_id
            ? "Proponer corrección del reparto"
            : "Preparar un nuevo cálculo"}
        </button>
      )}
      {canWrite && calculating && (
        <form onSubmit={calculate} className="panel">
          <h3>Elegir método y calcular</h3>
          <ConfigurationFields
            value={config}
            onChange={setConfig}
            units={units}
            people={people}
          />
          <p>
            Si cambias estas condiciones también quedarán propuestas para
            próximos recibos. Las distribuciones confirmadas conservan las
            anteriores.
          </p>
          {config.method === "manual" &&
            (config.unit_ids.length ? config.unit_ids : [null]).map((id) => (
              <Field
                key={id || "whole"}
                label={`Importe manual de ${units.find((u) => u.id === id)?.name || "Casa completa"}`}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manual[String(id)] || ""}
                  required
                  onChange={(e) =>
                    setManual({ ...manual, [String(id)]: e.target.value })
                  }
                />
              </Field>
            ))}
          {receipt.current_distribution_id && (
            <label className="check">
              <input
                type="checkbox"
                checked={adjustment}
                required
                onChange={(e) => setAdjustment(e.target.checked)}
              />
              Proponer una corrección conservando el reparto aprobado
            </label>
          )}
          {(receipt.current_distribution_id || config.method === "manual") && (
            <Field label="Motivo del cálculo o corrección">
              <textarea
                minLength={3}
                maxLength={2000}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <div className="actions">
            <button disabled={busy}>
              {busy ? "Calculando…" : "Calcular reparto"}
            </button>
            {dist && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setCalculating(false)}
              >
                Volver al resultado
              </button>
            )}
          </div>
        </form>
      )}
      {dist && (
        <>
          <section className="panel">
            <h3>Resumen del reparto · {distributionStates[dist.status]}</h3>
            <p>
              Revisión del recibo: {dist.receipt.revision}. Importe utilizado:{" "}
              <strong>
                {money(dist.receipt.amount, dist.receipt.currency)}
              </strong>
              .
            </p>
            <p>
              Método: {methods[dist.configuration.method]} ·{" "}
              {dist.evidence.period_days} días reales de consumo.
            </p>
            <p>
              Previsto para pagar al proveedor:{" "}
              {personName(dist.configuration.provider_payer_id)}.
            </p>
            <p>
              Previsto para recibir reintegros:{" "}
              {personName(dist.configuration.reimbursement_person_id)}.
            </p>
            {dist.status === "needs_review" && (
              <div className="error-message" role="alert">
                <p>Revise los siguientes puntos antes de confirmar:</p>
                <ul>
                  {dist.evidence.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {dist.evidence.manual_resolution && (
              <p>Revisión manual: {dist.evidence.manual_resolution.reason}</p>
            )}
            <div className="utility-spaces">
              {dist.allocations.map((a) => (
                <article className="utility-space" key={a.id}>
                  <h4>
                    {a.unit_label}: {money(a.amount, dist.receipt.currency)}
                  </h4>
                  {a.responsibilities.map((r) => (
                    <p key={r.id}>
                      {r.kind === "occupant"
                        ? "Ocupante"
                        : "Propietario o responsable acordado"}
                      :{" "}
                      <strong>
                        {personName(r.person_id)} ·{" "}
                        {money(r.amount, dist.receipt.currency)}
                      </strong>
                      {r.contract_id &&
                        ` · Contrato ${r.contract_id} · ${r.occupied_days} días`}
                    </p>
                  ))}
                  {!a.responsibilities.length && (
                    <p>Sin importe asignado a personas en este espacio.</p>
                  )}
                  <details>
                    <summary>Ver días y cálculo de {a.unit_label}</summary>
                    {dist.evidence.spaces
                      .find((s) => s.unit_id === a.unit_id)
                      ?.contracts.map((c) => (
                        <p key={c.id}>
                          Contrato {c.id}: {showDate(c.start_date)} al{" "}
                          {showDate(c.end_date)}, {c.occupied_days} días.{" "}
                          {c.exempt
                            ? "Servicios incluidos: sin gasto adicional para el ocupante."
                            : `Importe teórico: ${money(c.theoretical_amount, dist.receipt.currency)}.`}
                        </p>
                      )) || null}
                    <p>
                      Menos de 15 días: parte del espacio × días ocupados /{" "}
                      {dist.evidence.period_days}. Desde 15 días: parte
                      completa, cuando corresponde al ocupante.
                    </p>
                  </details>
                </article>
              ))}
            </div>
            <p className="utility-total">
              Total asignado:{" "}
              <strong>
                {money(dist.assigned_total, dist.receipt.currency)}
              </strong>{" "}
              · Responsabilidades:{" "}
              <strong>
                {money(dist.responsibility_total, dist.receipt.currency)}
              </strong>{" "}
              · Recibo:{" "}
              <strong>
                {money(dist.receipt.amount, dist.receipt.currency)}
              </strong>
            </p>
            {canConfirm &&
              ["calculated", "needs_review"].includes(dist.status) && (
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setResolving(true)}
                  >
                    Revisar importes manualmente
                  </button>
                  <button
                    disabled={busy || dist.status !== "calculated"}
                    onClick={() => void confirm()}
                  >
                    {busy ? "Guardando…" : "Confirmar distribución"}
                  </button>
                </div>
              )}
            {!canConfirm && canWrite && (
              <p>Un administrador debe revisar y confirmar la distribución.</p>
            )}
            {dist.is_current && (
              <p className="success-message">
                Este es el último reparto aprobado de este recibo.
              </p>
            )}
            <p>
              Confirmar un reparto conserva responsabilidades económicas. No
              registra dinero recibido, pagado ni recuperado.
            </p>
          </section>
        </>
      )}
      {history && (
        <section className="panel">
          <h3>Historial del recibo y sus distribuciones</h3>
          <ul>
            {history.revisions.map((r) => (
              <li key={r.id}>
                Revisión {r.revision}: {money(r.amount, r.currency)} ·{" "}
                {showDate(r.period_start)} al {showDate(r.period_end)}
              </li>
            ))}
          </ul>
          {history.distributions.map((d) => (
            <article className="history-item" key={d.id}>
              <h4>
                Reparto {d.id}: {distributionStates[d.status]}
              </h4>
              <p>
                {money(d.receipt.amount, d.receipt.currency)} ·{" "}
                {d.reason || "Cálculo del recibo"}
                {d.is_current ? " · Último aprobado" : ""}
              </p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setDist(d);
                  setCalculating(false);
                  setNotice("");
                }}
              >
                Ver reparto {d.id}
              </button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

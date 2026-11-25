import {
  RecordCollection,
  RecordField,
  RecordRow,
  useListPreference,
} from "../../components/RecordList";
import { StatusIndicator } from "../../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { SearchSelect } from "../../components/SearchSelect";
import { supplyOption } from "../../utilities";
import type { User, Unit } from "../../types";
import type { ServiceAccount, Meter, Reading } from "../../utilities";
import { Field, ErrorMessage, errorText } from "../../components/Form";
import { localToday, showDate } from "../../tenancy";

export function Meters({
  accounts,
  units,
  user,
  reload,
}: {
  accounts: ServiceAccount[];
  units: Pick<Unit, "id" | "code" | "name">[];
  user: User;
  reload: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useListPreference(
      `meters:${accounts[0]?.property_id ?? "none"}:account`,
      accounts[0]?.id || 0,
    ),
    [meters, setMeters] = useState<Meter[]>([]),
    [selected, setSelected] = useState<Meter | null>(null),
    [readings, setReadings] = useState<Reading[]>([]),
    [form, setForm] = useState<{ replacement?: Meter } | null>(null),
    [correction, setCorrection] = useState<Reading | null>(null),
    [retiring, setRetiring] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const seq = useRef(0);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const account = accounts.find((a) => a.id === accountId),
    canWrite = user.role !== "owner",
    canCorrect =
      user.role === "general_admin" || user.role === "property_admin";
  async function load() {
    if (!accountId) return;
    const request = ++seq.current;
    setError("");
    try {
      const result = await api<Meter[]>(
        `/service-accounts/${accountId}/meters`,
      );
      if (request === seq.current) setMeters(result);
    } catch (e) {
      if (request === seq.current) setError(errorText(e));
    }
  }
  useEffect(() => {
    setSelected(null);
    setForm(null);
    setMeters([]);
    void load();
    return () => {
      seq.current++;
    };
  }, [accountId]);
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts]);
  async function detail(meter: Meter) {
    setError("");
    try {
      const values = await api<Reading[]>(
        `/utility-meters/${meter.id}/readings`,
      );
      if (meter.account_id !== currentAccount.current) return;
      setSelected(meter);
      setReadings(values);
      setCorrection(null);
      setRetiring(false);
      setNotice("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    if (
      !window.confirm(
        correction
          ? "¿Corregir esta lectura y conservar los valores anteriores en el historial?"
          : "¿Guardar esta lectura del medidor?",
      )
    )
      return;
    const values = new FormData(e.currentTarget);
    const htmlForm = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await api(
        correction
          ? `/meter-readings/${correction.id}`
          : `/utility-meters/${selected.id}/readings`,
        correction ? "PATCH" : "POST",
        {
          recorded_on: String(values.get("date")),
          value: String(values.get("value")),
          notes: String(values.get("notes") || "") || null,
          ...(correction
            ? {
                expected_version: correction.version,
                reason: String(values.get("reason")),
              }
            : {}),
        },
      );
      await reload();
      await detail(selected);
      setCorrection(null);
      setNotice(
        "Lectura guardada. Las distribuciones ya confirmadas conservan su evidencia original.",
      );
      htmlForm.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function retire(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !selected ||
      !window.confirm(
        "¿Registrar el retiro de este medidor sin borrar sus lecturas?",
      )
    )
      return;
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<Meter>(
        `/utility-meters/${selected.id}/retire`,
        "POST",
        {
          retired_on: String(values.get("date")),
          reason: String(values.get("reason")),
          expected_version: selected.version,
        },
      );
      await reload();
      await load();
      await detail(result);
      setRetiring(false);
      setNotice("Retiro registrado; se conservan las lecturas.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (form && account)
    return (
      <MeterForm
        account={account}
        units={units}
        replacement={form.replacement}
        onCancel={() => setForm(null)}
        onSaved={async (meter) => {
          await reload();
          await load();
          setForm(null);
          await detail(meter);
        }}
      />
    );
  return (
    <section>
      <h2>Medidores y lecturas</h2>
      <SearchSelect
        label="Servicio para consultar medidores"
        value={accountId || ""}
        options={accounts.map(supplyOption)}
        onChange={(id) => {
          setAccountId(Number(id));
          setNotice("");
        }}
      />
      <ErrorMessage message={error} />
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {!selected ? (
        <>
          <p>
            Internet, basura y otros servicios de importe fijo pueden
            registrarse sin medidor.
          </p>
          {canWrite && account && (
            <button disabled={!account.is_active} onClick={() => setForm({})}>
              Registrar medidor
            </button>
          )}
          <RecordCollection
            id={`meters:${accountId}`}
            label="medidores"
            items={meters}
            searchable={(m) =>
              `${m.id} ${m.serial} ${m.unit_label} ${m.measure_unit} ${m.installed_on} ${m.retired_on ?? ""}`
            }
            filter={{
              label: "Estado del medidor",
              value: (m) => (m.retired_on ? "Retirado" : "Instalado"),
            }}
            empty="No hay medidores en este servicio."
            render={(m) => (
              <RecordRow
                key={m.id}
                title={`Medidor ${m.serial}`}
                fields={
                  <>
                    <RecordField label="Espacio">{m.unit_label}</RecordField>
                    <RecordField label="Unidad">{m.measure_unit}</RecordField>
                    <RecordField label="Instalación">
                      {showDate(m.installed_on)}
                    </RecordField>
                    {m.retired_on && (
                      <RecordField label="Fecha de retiro">
                        {showDate(m.retired_on)}
                      </RecordField>
                    )}
                    <RecordField label="Estado">
                      <StatusIndicator
                        tone={m.retired_on ? "gray" : "blue"}
                        label={m.retired_on ? "Retirado" : "Instalado"}
                      />
                    </RecordField>
                  </>
                }
                actions={
                  <button className="secondary" onClick={() => void detail(m)}>
                    Ver lecturas de {m.serial}
                  </button>
                }
                detail={
                  m.replaces_id ? (
                    <p>Reemplaza al medidor n.º {m.replaces_id}.</p>
                  ) : undefined
                }
              />
            )}
          />
        </>
      ) : (
        <>
          <button
            className="text-button"
            onClick={() => {
              setSelected(null);
              setCorrection(null);
              setNotice("");
              void load();
            }}
          >
            ← Volver a medidores
          </button>
          <h3>
            Lecturas del medidor {selected.serial} · {selected.unit_label}
          </h3>
          <p>
            Unidad: {selected.measure_unit}. Instala o reemplaza un medidor si
            cambió físicamente; no reinicies los valores del anterior.
          </p>
          {canWrite && (
            <div className="actions">
              {!selected.retired_on && (
                <button
                  className="secondary"
                  onClick={() => setForm({ replacement: selected })}
                >
                  Reemplazar este medidor
                </button>
              )}
              {canCorrect && !selected.retired_on && (
                <button
                  className="secondary"
                  onClick={() => setRetiring(!retiring)}
                >
                  Registrar retiro
                </button>
              )}
            </div>
          )}
          {retiring && (
            <form className="panel" onSubmit={retire}>
              <Field label="Fecha de retiro">
                <input
                  type="date"
                  name="date"
                  min={selected.installed_on}
                  defaultValue={localToday()}
                  required
                />
              </Field>
              <Field label="Motivo del retiro">
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={2000}
                />
              </Field>
              <button disabled={busy}>Guardar retiro</button>
            </form>
          )}
          <RecordCollection
            id={`meters:${selected.id}:readings`}
            label="lecturas"
            items={readings}
            searchable={(r) =>
              `${r.recorded_on} ${showDate(r.recorded_on)} ${r.value} ${r.consumption_since_previous ?? "Lectura inicial"}`
            }
            render={(r) => (
              <RecordRow
                key={r.id}
                title={showDate(r.recorded_on)}
                fields={
                  <>
                    <RecordField label="Lectura">{r.value}</RecordField>
                    <RecordField label="Consumo">
                      {r.consumption_since_previous ?? "Lectura inicial"}
                    </RecordField>
                  </>
                }
                actions={
                  canCorrect && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setCorrection(r);
                        setNotice("");
                      }}
                    >
                      Corregir lectura del {showDate(r.recorded_on)}
                    </button>
                  )
                }
              />
            )}
          />
          {canWrite && (
            <form
              className="panel"
              key={correction?.id || "new"}
              onSubmit={record}
            >
              <h3>{correction ? "Corregir lectura" : "Registrar lectura"}</h3>
              <div className="form-grid">
                <Field label="Fecha de la lectura">
                  <input
                    type="date"
                    name="date"
                    min={selected.installed_on}
                    max={selected.retired_on || undefined}
                    defaultValue={correction?.recorded_on || localToday()}
                    required
                  />
                </Field>
                <Field label="Valor de la lectura">
                  <input
                    type="number"
                    name="value"
                    min={0}
                    step="0.000001"
                    defaultValue={correction?.value}
                    required
                  />
                </Field>
                <Field label="Observaciones de la lectura (opcional)">
                  <textarea
                    name="notes"
                    defaultValue={correction?.notes || ""}
                    maxLength={3000}
                  />
                </Field>
                {correction && (
                  <Field label="Motivo de la corrección">
                    <textarea
                      name="reason"
                      minLength={3}
                      maxLength={2000}
                      required
                    />
                  </Field>
                )}
              </div>
              <p>
                Para calcular un recibo por consumo se necesitan la lectura de
                apertura de su fecha inicial y la lectura de cierre de su fecha
                final.
              </p>
              <div className="actions">
                <button disabled={busy}>
                  {busy
                    ? "Guardando…"
                    : correction
                      ? "Guardar corrección de lectura"
                      : "Guardar lectura"}
                </button>
                {correction && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setCorrection(null)}
                  >
                    Cancelar corrección
                  </button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function MeterForm({
  account,
  units,
  replacement,
  onCancel,
  onSaved,
}: {
  account: ServiceAccount;
  units: Pick<Unit, "id" | "code" | "name">[];
  replacement?: Meter;
  onCancel: () => void;
  onSaved: (meter: Meter) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        replacement
          ? "¿Reemplazar el medidor conservando todas sus lecturas?"
          : "¿Guardar este medidor?",
      )
    )
      return;
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<Meter>(
        `/service-accounts/${account.id}/meters`,
        "POST",
        {
          serial: String(values.get("serial")),
          unit_id: replacement
            ? replacement.unit_id
            : Number(values.get("unit")) || null,
          installed_on: String(values.get("date")),
          initial_value: String(values.get("initial")) || null,
          replaces_id: replacement?.id || null,
          notes: String(values.get("notes") || "") || null,
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
      <h2>{replacement ? "Reemplazar medidor" : "Registrar medidor"}</h2>
      <p>
        {account.label} ·{" "}
        {account.measure_unit ||
          "Indica primero la unidad de medida al registrar o editar el servicio."}
      </p>
      <ErrorMessage message={error} />
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Identificación del medidor nuevo">
            <input name="serial" required maxLength={100} />
          </Field>
          <SearchSelect
            label="Espacio medido"
            name="unit"
            defaultValue={replacement?.unit_id || ""}
            disabled={!!replacement}
            options={units
              .filter(
                (unit) =>
                  account.configuration.unit_ids.includes(unit.id) ||
                  unit.id === replacement?.unit_id,
              )
              .map((unit) => ({
                value: unit.id,
                label: `${unit.code} · ${unit.name}`,
              }))}
            hint="Si queda vacío, es el medidor principal de la casa."
          />
          <Field
            label={replacement ? "Fecha del reemplazo" : "Fecha de instalación"}
          >
            <input
              name="date"
              type="date"
              required
              defaultValue={localToday()}
              min={account.start_date}
            />
          </Field>
          <Field label="Lectura inicial (opcional)">
            <input name="initial" type="number" min={0} step="0.000001" />
          </Field>
          <Field label="Observaciones del medidor (opcional)">
            <textarea name="notes" maxLength={3000} />
          </Field>
        </div>
        {replacement && (
          <p>
            El medidor {replacement.serial} tendrá su retiro en la fecha del
            reemplazo. El nuevo puede comenzar desde cero sin alterar los
            valores anteriores.
          </p>
        )}
        <div className="actions">
          <button disabled={busy}>Guardar medidor</button>
          <button
            className="secondary"
            type="button"
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

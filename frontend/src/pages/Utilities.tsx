import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Person, Property, User } from "../types";
import type { Receipt, ServiceAccount, UtilityType } from "../utilities";
import { distributionStates, money } from "../utilities";
import { Field, ErrorMessage, errorText } from "../components/Form";
import { usePropertyData } from "./tenancy/Shared";
import { showDate } from "../tenancy";
import { Services } from "./utilities/Services";
import { Meters } from "./utilities/Meters";
import { ReceiptForm } from "./utilities/ReceiptForm";
import { ReceiptDetail } from "./utilities/ReceiptDetail";

export function Utilities({
  user,
  properties,
  people,
}: {
  user: User;
  properties: Property[];
  people: Person[];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 0),
    [tab, setTab] = useState("services"),
    [accounts, setAccounts] = useState<ServiceAccount[]>([]),
    [types, setTypes] = useState<UtilityType[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [selected, setSelected] = useState<Receipt | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const seq = useRef(0);
  const currentProperty = useRef(propertyId);
  currentProperty.current = propertyId;
  const property = properties.find((p) => p.id === propertyId),
    data = usePropertyData(propertyId, people, user.role === "general_admin");
  async function load() {
    if (!propertyId || propertyId !== currentProperty.current) return;
    const request = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const [a, t, r] = await Promise.all([
        api<ServiceAccount[]>(`/service-accounts?property_id=${propertyId}`),
        api<UtilityType[]>("/utility-types"),
        api<Receipt[]>(`/utility-receipts?property_id=${propertyId}`),
      ]);
      if (request === seq.current) {
        setAccounts(a);
        setTypes(t);
        setReceipts(r);
      }
    } catch (e) {
      if (request === seq.current) setError(errorText(e));
    } finally {
      if (request === seq.current) setBusy(false);
    }
  }
  useEffect(() => {
    setAccounts([]);
    setReceipts([]);
    setSelected(null);
    setCreating(false);
    void load();
    return () => {
      seq.current++;
    };
  }, [propertyId]);
  const changeTab = (value: string) => {
    setTab(value);
    setSelected(null);
    setCreating(false);
  };
  return (
    <section>
      <p className="eyebrow">RECIBOS EXISTENTES Y RESPONSABILIDADES</p>
      <h1>Servicios básicos</h1>
      <p>
        Registra los recibos de proveedores y revisa cómo se reparte cada gasto.
      </p>
      <Field label="Casa de los servicios básicos">
        <select
          required
          value={propertyId || ""}
          onChange={(e) => {
            setSelected(null);
            setCreating(false);
            setPropertyId(Number(e.target.value));
          }}
        >
          <option value="">Seleccionar casa</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <nav className="utility-tabs" aria-label="Secciones de servicios básicos">
        {[
          ["services", "Servicios y suministros"],
          ["meters", "Medidores y lecturas"],
          ["receipts", "Recibos y distribución"],
          ["history", "Historial de servicios"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "" : "secondary"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => changeTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <ErrorMessage message={error || data.error} />
      {!property ? (
        <p className="empty">Selecciona una casa autorizada para continuar.</p>
      ) : busy && !accounts.length ? (
        <p role="status">Cargando servicios…</p>
      ) : (
        <div key={propertyId}>
          {tab === "services" ? (
            <Services
              property={property}
              user={user}
              accounts={accounts}
              types={types}
              people={data.candidates}
              units={data.units}
              reload={load}
            />
          ) : tab === "meters" ? (
            <Meters
              accounts={accounts}
              units={data.units}
              user={user}
              reload={load}
            />
          ) : creating ? (
            <ReceiptForm
              accounts={accounts}
              onCancel={() => setCreating(false)}
              onSaved={async (r) => {
                await load();
                if (currentProperty.current === r.property_id) {
                  setCreating(false);
                  setSelected(r);
                }
              }}
            />
          ) : selected ? (
            <ReceiptDetail
              key={selected.id}
              initial={selected}
              accounts={accounts}
              people={data.candidates}
              units={data.units}
              user={user}
              reload={load}
              onBack={() => setSelected(null)}
            />
          ) : (
            <section>
              <div className="page-heading">
                <div>
                  <h2>
                    {tab === "history"
                      ? "Recibos y distribuciones conservados"
                      : "Recibos del proveedor"}
                  </h2>
                  <p>
                    Un recibo registrado o distribuido no significa que se haya
                    pagado.
                  </p>
                </div>
                {user.role !== "owner" && tab !== "history" && (
                  <button
                    disabled={!accounts.some((a) => a.is_active)}
                    onClick={() => setCreating(true)}
                  >
                    Registrar recibo
                  </button>
                )}
              </div>
              <div className="record-list">
                {receipts.map((r) => (
                  <article key={r.id}>
                    <div className="record-main">
                      <h3>
                        {r.account_label}: {money(r.amount, r.currency)}
                      </h3>
                      <p>
                        {r.provider} ·{" "}
                        {r.external_reference || "Sin referencia externa"}
                      </p>
                      <p>
                        Consumo: {showDate(r.period_start)} al{" "}
                        {showDate(r.period_end)} · Límite de pago:{" "}
                        {showDate(r.due_on)}
                      </p>
                      <p>
                        <strong>
                          {distributionStates[r.distribution_status]}
                        </strong>{" "}
                        · Sin pago registrado aquí
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setSelected(r)}
                    >
                      Ver recibo {r.id} y reparto
                    </button>
                  </article>
                ))}
                {!receipts.length && (
                  <p className="empty">
                    Todavía no hay recibos registrados para esta casa.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

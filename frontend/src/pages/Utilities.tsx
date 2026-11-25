import {
  RecordCollection,
  RecordField,
  RecordRow,
  useListPreference,
} from "../components/RecordList";
import { RecordStatus } from "../components/StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { PropertySelect } from "../components/PropertySelect";
import type { Person, Property, User } from "../types";
import type { Receipt, ServiceAccount, UtilityType } from "../utilities";
import { distributionStates, money } from "../utilities";
import {
  ErrorMessage,
  errorText,
  confirmFormDiscard,
} from "../components/Form";
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
  initialPropertyId,
  initialReceiptId,
}: {
  user: User;
  properties: Property[];
  people: Person[];
  initialPropertyId?: number;
  initialReceiptId?: number;
}) {
  const content = useRef<HTMLElement>(null);
  const [savedProperty, saveProperty] = useListPreference("utilities:house", 0);
  const [propertyId, setPropertyId] = useState(
    initialPropertyId || savedProperty || properties[0]?.id || 0,
  );
  const [tab, setTab] = useListPreference(
    initialReceiptId ? undefined : `utilities:${propertyId}:tab`,
    initialReceiptId ? "receipts" : "services",
  );
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]),
    [types, setTypes] = useState<UtilityType[]>([]),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [selected, setSelected] = useState<Receipt | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const seq = useRef(0);
  const initialReceipt = useRef(initialReceiptId);
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
        if (initialReceipt.current) {
          const selected = r.find(
            (receipt) => receipt.id === initialReceipt.current,
          );
          if (selected) setSelected(selected);
          initialReceipt.current = undefined;
        }
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
  const canLeave = () =>
    confirmFormDiscard(
      content.current?.querySelector("form[data-dirty]") ?? null,
    );
  const changeTab = (value: string) => {
    if (value === tab || !canLeave()) return;
    setTab(value);
    setSelected(null);
    setCreating(false);
  };
  return (
    <section ref={content}>
      <p className="eyebrow">RECIBOS EXISTENTES Y RESPONSABILIDADES</p>
      <h1>Servicios básicos</h1>
      <p>
        Registra los recibos de proveedores y revisa cómo se reparte cada gasto.
      </p>
      <PropertySelect
        label="Casa de los servicios básicos"
        properties={properties}
        value={propertyId || ""}
        onChange={(id) => {
          if (!canLeave()) return;
          setPropertyId(Number(id));
          saveProperty(Number(id));
        }}
      />
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
              createSupply={
                user.role === "owner"
                  ? undefined
                  : {
                      property,
                      user,
                      types,
                      people: data.candidates,
                      units: data.units,
                      onAdded: (account) =>
                        setAccounts((current) => [...current, account]),
                    }
              }
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
                  <button onClick={() => setCreating(true)}>
                    Registrar recibo
                  </button>
                )}
              </div>
              <RecordCollection
                id={`utilities:${propertyId}:${tab}`}
                label="recibos"
                items={receipts}
                searchable={(r) =>
                  `${r.id} ${r.account_label} ${r.provider} ${r.external_reference ?? ""} ${showDate(r.issued_on)} ${showDate(r.due_on)} ${distributionStates[r.distribution_status]}`
                }
                filter={{
                  label: "Estado del reparto",
                  value: (r) => distributionStates[r.distribution_status],
                }}
                empty={
                  receipts.length
                    ? "No se encontraron recibos."
                    : "Todavía no hay recibos registrados para esta casa."
                }
                render={(r) => (
                  <RecordRow
                    key={r.id}
                    title={`${r.account_label} · ${money(r.amount, r.currency)}`}
                    fields={
                      <>
                        <RecordField label="Proveedor">
                          {r.provider}
                        </RecordField>
                        {r.external_reference && (
                          <RecordField label="Referencia">
                            {r.external_reference}
                          </RecordField>
                        )}
                        <RecordField label="Consumo">
                          {showDate(r.period_start)} al {showDate(r.period_end)}
                        </RecordField>
                        <RecordField label="Límite de pago">
                          {showDate(r.due_on)}
                        </RecordField>
                        <RecordField label="Reparto">
                          <RecordStatus
                            domain="distribution"
                            state={r.distribution_status}
                          />
                        </RecordField>
                      </>
                    }
                    actions={
                      <button
                        className="secondary"
                        onClick={() => setSelected(r)}
                      >
                        Ver recibo {r.id} y reparto
                      </button>
                    }
                  />
                )}
              />
            </section>
          )}
        </div>
      )}
    </section>
  );
}

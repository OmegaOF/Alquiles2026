export const reportNames = {
  economic: "Reporte económico general",
  properties: "Por propiedad",
  owners: "Por propietario",
  units: "Por cuarto o unidad",
  contracts: "Por contrato",
  collections: "Cobranzas y deudas",
  services: "Servicios básicos",
  expenses: "Gastos",
  capital: "Capital de anticréticos",
  comparison: "Comparar propiedades y periodos",
};
export type ReportKind = keyof typeof reportNames;
export const measureNames: Record<string, string> = {
  charges_recorded: "Cargos registrados en el periodo",
  obligations_total: "Cargos vigentes al corte",
  obligations_applied: "Aplicado a cargos al corte",
  pending: "Saldo por cobrar al corte",
  rent_pending: "Alquiler pendiente",
  service_pending: "Servicios pendientes",
  ordinary_received: "Cobros y anticipos recibidos",
  cash_received: "Total de entradas reales",
  expenses_recorded: "Gastos registrados en el periodo",
  expense_total: "Gasto vigente al corte",
  expense_applied: "Desembolsos aplicados al corte",
  payable_pending: "Gastos pendientes de pago",
  provider_refund_pending: "Importe pendiente de devolución del proveedor",
  disbursed: "Desembolsos propios en el periodo",
  cash_out: "Total de salidas propias",
  provider_direct: "Pagos directos de terceros",
  refunded: "Devoluciones de fondos",
  services_recovered: "Fondos aplicados a servicios",
  services_direct: "Servicios cubiertos directamente",
  owner_service_responsibility: "Parte del propietario en recibos cerrados",
  occupant_service_responsibility: "Parte del ocupante en recibos cerrados",
  recoveries_pending: "Servicios por recuperar con proveedor pagado",
  guarantees_received: "Garantías recibidas",
  guarantees_available: "Garantías disponibles al corte",
  advances_received: "Anticipos recibidos (incluidos en cobros)",
  credit_available: "Crédito y anticipos disponibles",
  capital_agreed: "Capital acordado de los contratos consultados",
  capital_received: "Capital recibido acumulado",
  capital_returned: "Capital devuelto acumulado",
  capital_pending: "Capital pendiente de devolución",
  capital_adjustments: "Ajustes de capital sin dinero",
  capital_received_period: "Capital recibido en el periodo",
  capital_returned_period: "Capital devuelto en el periodo",
  noncash_adjustments: "Ajustes económicos sin dinero",
};
export type Summary = Record<string, string | null> & { currency: string };
export type ReportRow = Record<string, unknown>;
export type ReportData = {
  kind: ReportKind;
  title: string;
  filters: Record<string, string | number | null>;
  period: { start: string; end: string; as_of: string; timezone: string };
  properties: { id: number; name: string }[];
  summary: Summary[];
  counts: Record<string, number | null>;
  series: (Summary & { month: string; has_data: boolean })[];
  occupancy: {
    month: string;
    occupied_unit_days: number;
    unit_days: number;
    occupancy_percent: string | null;
  }[];
  rows: ReportRow[];
  movements: ReportRow[];
  limitations: string[];
  total_rows: number;
  has_data: boolean;
  fingerprint: string;
  page: number;
  page_size: number;
  generated_at: string;
};
export type Choice = {
  id: number;
  name: string;
  property_id?: number;
  unit_id?: number | null;
};
export type ReportOptions = {
  properties: Choice[];
  units: Choice[];
  contracts: Choice[];
  owners: Choice[];
  people: Choice[];
  services: Choice[];
  categories: Choice[];
  today: string;
};
export type Filters = Record<string, string>;
export function query(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => params.set(k, v));
  return params.size ? "?" + params.toString() : "";
}
// Presentación textual exacta: no convierte el dinero a Number ni calcula saldos.
export function money(value: unknown, currency: unknown = "") {
  if (value === null || value === undefined) return "Sin información";
  return String(value) + (currency ? " " + String(currency) : "");
}
export function presetDates(preset: string, today: string): Filters {
  const [year, month] = today.split("-").map(Number);
  const iso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  if (preset === "previous")
    return {
      start_date: iso(year, month - 1, 1),
      end_date: iso(year, month, 0),
    };
  if (preset === "quarter")
    return { start_date: iso(year, month - 2, 1), end_date: today };
  if (preset === "year")
    return { start_date: iso(year, 1, 1), end_date: today };
  return { start_date: iso(year, month, 1), end_date: today };
}

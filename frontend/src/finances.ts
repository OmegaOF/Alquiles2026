export { money } from "./utilities";
export const financeStates: Record<string, string> = {
  pending: "Pendiente",
  partial: "Pagado parcialmente",
  paid: "Pagado",
  overdue: "Vencido",
  adjusted: "Anulado o ajustado",
  voided: "Anulado",
  registered: "Registrado",
  received: "Recibida",
  held: "Retenida",
  partially_applied: "Aplicada parcialmente",
  partially_refunded: "Devuelta parcialmente",
  refunded: "Devuelta completamente",
};
export const movementNames: Record<string, string> = {
  received: "Pago recibido",
  advance: "Anticipo",
  guarantee: "Garantía recibida",
  disbursed: "Pago realizado",
  provider_direct: "Pago del inquilino al proveedor",
  refund: "Devolución",
  capital_received: "Entrega de capital anticrético",
  capital_returned: "Restitución de capital anticrético",
};
export interface Catalog {
  id: number;
  name: string;
  is_active: boolean;
}
export interface FinanceApplication {
  id: number;
  source_movement_id: number;
  obligation_id: number;
  amount: string;
  void_operation_id: number | null;
  operation_id: number;
}
export interface Obligation {
  id: number;
  person_id: number;
  unit_id: number | null;
  contract_id: number;
  receipt_id: number | null;
  service_origin_id: number | null;
  currency: string;
  concept: string;
  period_start: string;
  period_end: string;
  effective_period_end: string;
  effective_due_on: string;
  original_amount: string;
  adjustments: string;
  total: string;
  applied: string;
  credit_applied: string;
  pending: string;
  state: string;
  applications: FinanceApplication[];
}
export interface Movement {
  id: number;
  person_id: number | null;
  payer_id: number;
  beneficiary_person_id: number | null;
  beneficiary_label: string | null;
  currency: string;
  kind: string;
  state: string;
  amount: string;
  applied: string;
  available: string;
  occurred_on: string;
  method_id: number;
  reference: string | null;
  document_reference: string | null;
  void_operation_id: number | null;
  contract_id: number | null;
  conditions: string | null;
  expense_id: number | null;
  applications: FinanceApplication[];
}
export interface Expense {
  id: number;
  person_id: number;
  unit_id: number | null;
  currency: string;
  category_id: number;
  receipt_id: number | null;
  description: string;
  recorded_on: string;
  original_amount: string;
  total: string;
  paid: string;
  pending: string;
  provider_refund_pending: string;
  owner_service_amount: string;
  imported_distribution_id: number | null;
  pending_distribution_change: boolean;
  void_operation_id: number | null;
  state: string;
}
export interface FinanceHistory {
  id: number;
  action: string;
  created_at: string;
  created_by: number;
  result: string;
}
export interface FinanceData {
  obligations: Obligation[];
  movements: Movement[];
  expenses: Expense[];
  summary: Record<string, string>[];
  history: FinanceHistory[];
}
export interface FinanceCatalogs {
  methods: Catalog[];
  categories: Catalog[];
}
export interface FinanceResult {
  operation_id: number;
  movement_id?: number;
  expense_id?: number;
  obligation_ids?: number[];
}
export interface RentPreview {
  issues: string[];
  periods: { start: string; end: string; amount: string; due_on: string }[];
  currency: string;
}
export const summaryLabels: Record<string, string> = {
  capital_agreed: "Capital anticrético acordado (no es dinero recibido)",
  capital_received: "Capital anticrético recibido, separado de alquiler",
  capital_returned: "Capital anticrético restituido, separado de gastos",
  capital_adjustments: "Acuerdos de restitución sin movimiento de dinero",
  capital_pending: "Capital anticrético pendiente de devolución",
  owner_services: "Parte económica de servicios del propietario",
  receivable: "Importes registrados por cobrar",
  pending: "Deuda pendiente",
  received: "Dinero recibido (sin garantías)",
  credit_available: "Anticipos y saldos a favor disponibles",
  guarantees_received: "Garantías recibidas",
  guarantees_available: "Garantías disponibles para devolución",
  expenses_registered: "Gastos registrados",
  disbursed: "Dinero pagado a proveedores",
  refunded: "Devoluciones realizadas",
  services_recovered: "Servicios cubiertos con dinero recibido",
  services_direct: "Servicios pagados directamente por inquilinos",
  provider_direct: "Pagos directos al proveedor (fuera de caja)",
};
export function exactCents(value: string): bigint {
  const m = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!m) return 0n;
  return (
    (m[1] ? -1n : 1n) *
    (BigInt(m[2] || "0") * 100n + BigInt((m[3] || "").padEnd(2, "0")))
  );
}
export function exactAmount(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const a = value < 0n ? -value : value;
  return `${sign}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}
export function financeToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/La_Paz",
  }).format(new Date());
}
export function newFinanceKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

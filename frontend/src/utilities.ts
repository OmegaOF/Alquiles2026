export const methods = {
  equal: "Partes iguales",
  percentage: "Porcentajes",
  occupants: "Cantidad de ocupantes (personas por día)",
  readings: "Consumo de medidores",
  manual: "Importes manuales",
};
export type UtilityMethod = keyof typeof methods;
export const distributionStates: Record<string, string> = {
  draft: "Borrador",
  calculated: "Calculado · pendiente de confirmar",
  needs_review: "Requiere revisión",
  confirmed: "Confirmado",
  superseded: "Sustituido · conservado en historial",
};
export interface UtilityType {
  id: number;
  name: string;
  is_active: boolean;
}
export interface Configuration {
  id: number;
  account_id: number;
  revision: number;
  method: UtilityMethod;
  economic_policy: "occupant" | "owner";
  unit_ids: number[];
  percentages: { unit_id: number; percentage: string }[];
  owner_person_id: number | null;
  provider_payer_id: number | null;
  reimbursement_person_id: number | null;
  notes: string | null;
}
export type ConfigFields = Pick<
  Configuration,
  | "method"
  | "economic_policy"
  | "unit_ids"
  | "percentages"
  | "owner_person_id"
  | "provider_payer_id"
  | "reimbursement_person_id"
  | "notes"
>;
export function configFields(c?: Configuration): ConfigFields {
  return {
    method: c?.method || "equal",
    economic_policy: c?.economic_policy || "occupant",
    unit_ids: c?.unit_ids || [],
    percentages: c?.percentages || [],
    owner_person_id: c?.owner_person_id || null,
    provider_payer_id: c?.provider_payer_id || null,
    reimbursement_person_id: c?.reimbursement_person_id || null,
    notes: c?.notes || null,
  };
}
export interface ServiceAccount {
  id: number;
  property_id: number;
  type_id: number;
  type_name: string;
  label: string;
  provider: string;
  account_number: string | null;
  measurement_kind: "individual" | "shared";
  measure_unit: string | null;
  start_date: string;
  is_active: boolean;
  notes: string | null;
  version: number;
  configuration: Configuration;
}
export interface Meter {
  id: number;
  account_id: number;
  unit_id: number | null;
  unit_label: string;
  serial: string;
  installed_on: string;
  retired_on: string | null;
  replaces_id: number | null;
  measure_unit: string;
  is_active: boolean;
  version: number;
  notes: string | null;
}
export interface Reading {
  id: number;
  meter_id: number;
  recorded_on: string;
  value: string;
  consumption_since_previous: string | null;
  version: number;
  notes: string | null;
}
export interface Receipt {
  id: number;
  revision_id: number;
  revision: number;
  version: number;
  account_id: number;
  property_id: number;
  account_label: string;
  provider: string;
  type_name: string;
  external_reference: string | null;
  amount: string;
  currency: string;
  issued_on: string;
  period_start: string;
  period_end: string;
  due_on: string;
  consumption: string | null;
  fixed_amount: string;
  document_reference: string | null;
  notes: string | null;
  distribution_status: string;
  current_distribution_id: number | null;
  latest_distribution_id: number | null;
  payment_recorded: false;
}
export interface Responsibility {
  id: number;
  allocation_id: number;
  kind: "owner" | "occupant";
  person_id: number | null;
  contract_id: number | null;
  amount: string;
  occupied_days: number | null;
  theoretical_amount: string | null;
}
export interface Allocation {
  id: number;
  unit_id: number | null;
  unit_label: string;
  amount: string;
  weight: string;
  responsibilities: Responsibility[];
}
export interface ContractEvidence {
  id: number;
  version: number;
  mode: string;
  people: number[];
  responsible_person_id: number;
  start_date: string;
  end_date: string;
  occupied_days: number;
  eligible: boolean;
  exempt: boolean;
  theoretical_amount: string;
}
export interface Distribution {
  id: number;
  receipt_id: number;
  receipt_revision_id: number;
  receipt_version: number;
  configuration_id: number;
  configuration: Configuration;
  receipt: Receipt;
  status: string;
  version: number;
  reason: string | null;
  supersedes_id: number | null;
  confirmed_at: string | null;
  confirmed_by: number | null;
  created_at: string;
  is_current: boolean;
  assigned_total: string;
  responsibility_total: string;
  payment_recorded: false;
  allocations: Allocation[];
  evidence: {
    period_days: number;
    method: UtilityMethod;
    issues: string[];
    manual_resolution?: { reason: string; actor_id: number; at: string };
    spaces: {
      unit_id: number | null;
      label: string;
      assigned_amount: string;
      contracts: ContractEvidence[];
      theoretical_total: string;
      over_available: boolean;
    }[];
  };
}
export interface ReceiptHistory {
  revisions: Receipt[];
  distributions: Distribution[];
}
export function money(value: string, currency = "BOB") {
  // Solo presentación: centavos enteros exactos, incluso para importes grandes.
  const [mantissa, power = "0"] = value.toLowerCase().split("e");
  const [whole, part = ""] = mantissa.split(".");
  const digits = whole + part,
    point = whole.length + Number(power);
  const expanded =
    point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point);
  const [integer, fraction = ""] = expanded.split(".");
  const cents =
    BigInt(integer || "0") * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2)) +
    (fraction.length > 2 && fraction[2] >= "5" ? 1n : 0n);
  const text = cents.toString().padStart(3, "0");
  return `${currency === "BOB" ? "Bs" : currency} ${text.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${text.slice(-2)}`;
}

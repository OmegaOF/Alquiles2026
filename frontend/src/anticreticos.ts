import type { Contract } from "./tenancy";
import type { Obligation } from "./finances";
export {
  money,
  exactCents,
  exactAmount,
  financeToday,
  newFinanceKey,
} from "./finances";
export const capitalStates: Record<string, string> = {
  preparation: "En preparación",
  pending_receipt: "Capital pendiente de recibir",
  partial_receipt: "Capital recibido parcialmente",
  received: "Capital recibido; restitución pendiente",
  partial_return: "Restitución parcial",
  returned: "Restituido completamente",
  settled_by_agreement: "Capital liquidado mediante acuerdo",
  overdue: "Restitución vencida",
};
export const capitalLabels: Record<string, string> = {
  capital_agreed: "Capital acordado",
  capital_received: "Capital efectivamente recibido",
  capital_to_receive: "Pendiente de recibir",
  capital_returned: "Capital efectivamente devuelto",
  capital_adjustments: "Ajustes de restitución sin dinero",
  capital_pending: "Pendiente de devolución",
};
export const capitalFields = [
  "capital_agreed",
  "capital_received",
  "capital_to_receive",
  "capital_returned",
  "capital_adjustments",
  "capital_pending",
] as const;
export const adjustmentNames: Record<string, string> = {
  settlement: "Reducción documentada de restitución",
  reassignment: "Reasignación documentada",
  additional: "Obligación adicional acordada",
};
export interface CapitalParty {
  person_id: number;
  assigned_amount: string;
  beneficiary_person_id?: number | null;
  received?: string;
  returned?: string;
  adjustments?: string;
  pending?: string;
}
export interface CapitalRevision {
  id: number;
  revision: number;
  agreed_capital: string;
  expected_delivery_on: string | null;
  restitution_on: string | null;
  allow_early_return: boolean;
  conditions: string;
  document_reference: string | null;
  notes: string | null;
  holders: CapitalParty[];
  responsibles: CapitalParty[];
  created_by: number;
  created_at: string;
  reason: string | null;
}
export interface CapitalPart {
  holder_id: number;
  responsible_id: number;
  amount: string;
}
export interface CapitalBalance {
  holder_id: number;
  responsible_id: number;
  received: string;
  returned: string;
  adjustments: string;
  pending: string;
}
export interface CapitalMovement {
  id: number;
  amount: string;
  currency: string;
  occurred_on: string;
  kind: "delivery" | "return";
  payer_id: number;
  beneficiary_person_id: number;
  method_id: number;
  reference: string | null;
  document_reference: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  void_operation_id: number | null;
  revision_id: number;
  allocations: CapitalPart[];
}
export interface CapitalAdjustment {
  id: number;
  kind: string;
  effective_on: string;
  document_reference: string;
  reason: string;
  created_by: number;
  created_at: string;
  void_operation_id: number | null;
  allocations: { holder_id: number; responsible_id: number; delta: string }[];
}
export interface CapitalBook {
  contract: Contract;
  version: number;
  currency: string;
  conditions: CapitalRevision | null;
  review_issues: string[];
  state: string;
  capital_agreed: string;
  capital_received: string;
  capital_to_receive: string;
  capital_returned: string;
  capital_adjustments: string;
  capital_pending: string;
  received_above_agreed: string;
  holders: CapitalParty[];
  responsibles: CapitalParty[];
  balances: CapitalBalance[];
  movements: CapitalMovement[];
  adjustments: CapitalAdjustment[];
  history: CapitalRevision[];
  service_obligations: Obligation[];
}
export interface CapitalSummary {
  currency: string;
  count: number;
  pending_conditions: number;
  capital_agreed: string;
  capital_received: string;
  capital_to_receive: string;
  capital_returned: string;
  capital_adjustments: string;
  capital_pending: string;
}
export interface CapitalData {
  items: CapitalBook[];
  summary: CapitalSummary[];
  today: string;
}
export interface CapitalTarget {
  propertyId: number;
  contractId?: number;
}

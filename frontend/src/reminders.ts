import type { Role } from "./types";
export { money, exactCents, exactAmount, newFinanceKey } from "./finances";
export { showDate, addDays } from "./tenancy";
export type ReminderKind =
  | "rent"
  | "service"
  | "recovery"
  | "provider"
  | "expense"
  | "contract"
  | "capital"
  | "report";
export const reminderKinds: Record<ReminderKind, string> = {
  rent: "Alquileres",
  service: "Servicios básicos",
  recovery: "Recuperaciones de servicios",
  provider: "Servicios del propietario",
  expense: "Pagos de gastos",
  contract: "Contratos",
  capital: "Anticréticos",
  report: "Pagos reportados",
};
export const priorities: Record<string, string> = {
  upcoming: "Próximo a vencer",
  today: "Vence hoy",
  overdue: "Vencido",
  date_missing: "Pendiente de revisión",
  resolved: "Resuelto por el origen",
  scheduled: "Fuera del plazo de avisos",
};
export const attentionNames: Record<string, string> = {
  pending: "Requiere atención",
  reviewed: "Revisado",
  snoozed: "Pospuesto",
  resolved: "Resuelto",
  scheduled: "Fuera del plazo de avisos",
};
export const communicationNames: Record<string, string> = {
  prepared: "Mensaje preparado",
  opened: "Apertura de WhatsApp registrada",
  manual_sent: "Envío confirmado manualmente",
  not_sent: "No enviado o cancelado",
  correct_sent: "Corrección: envío confirmado manualmente",
  correct_not_sent: "Corrección: no enviado",
};
export const reportStates: Record<string, string> = {
  reported: "Reportado",
  pending: "Pendiente de verificación",
  verified: "Verificado y vinculado a dinero real",
  rejected: "Rechazado",
  verification_invalid:
    "Revisar: el movimiento o su aplicación dejó de ser válido",
};
export interface ReminderOrigin {
  module: string;
  obligation_id?: number;
  receipt_id?: number;
  expense_id?: number;
  contract_id?: number;
  report_id?: number;
}
export interface AttentionEvent {
  id: number;
  kind: string;
  until_on: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
}
export interface Reminder {
  key: string;
  kind: ReminderKind;
  kind_label: string;
  purpose: string;
  property_id: number;
  property_name: string;
  unit_id: number | null;
  target_label: string;
  person_id: number | null;
  responsible_name: string;
  recipients: { id: number; full_name: string }[];
  recipient_ids: number[];
  due_on: string | null;
  days_remaining: number | null;
  days_overdue: number | null;
  amount: string | null;
  currency: string | null;
  concept: string;
  period: string | null;
  priority: string;
  requires_attention: boolean;
  resolved: boolean;
  resolution_reason: string | null;
  allow_whatsapp: boolean;
  origin: ReminderOrigin;
  source_fingerprint: string;
  attention_fingerprint: string;
  notice_id: number | null;
  version: number;
  attention_state: string;
  until_on: string | null;
  attention_history: AttentionEvent[];
  capital_received?: string;
  capital_returned?: string;
  capital_adjustments?: string;
  holder_id?: number;
  holder_name?: string;
  beneficiary_name?: string | null;
  reported_on?: string;
  beneficiary_person_id?: number | null;
  contract_status?: string;
  recorded_amount?: string;
  paid?: string;
  applied?: string;
  report_state?: string;
  report_id?: number;
  report_version?: number;
  review_issues?: string[];
}
export interface ReminderPreference {
  property_id: number;
  version: number;
  snooze_days: number;
  lead_days: number[];
  recipient_user_ids: number[];
  types: { kind: ReminderKind; is_enabled: boolean; allow_whatsapp: boolean }[];
  eligible_users?: { id: number; full_name: string; role: Role }[];
}
export interface ReminderData {
  items: Reminder[];
  today: string;
  preferences: ReminderPreference;
  summary: Record<string, number>;
}
export interface Consent {
  id: number;
  person_id: number;
  purpose: string;
  number: string;
  accepted_on: string;
  method: string;
  notes: string | null;
  version: number;
  is_active: boolean;
  matches_current_number: boolean;
  recorded_by: number;
  recorded_at: string;
  revoked_at: string | null;
  revoked_by: number | null;
}
export interface Template {
  id: number | null;
  kind: ReminderKind;
  name: string;
  body: string;
  effective_body: string;
  is_active: boolean;
  version: number;
  used_id: number | null;
  used_version: number;
}
export interface Proposal {
  proposal_fingerprint: string;
  event: Reminder;
  recipient_id: number;
  recipient_name: string;
  number: string;
  consent: Consent;
  text: string;
  template: { id: number | null; kind: string; version: number; name: string };
}
export interface Communication {
  id: number;
  notice_key: string;
  notice_id: number;
  version: number;
  state: string;
  recipient_id: number;
  recipient_name: string;
  purpose: string;
  number: string | null;
  masked_number: string;
  final_text: string | null;
  template_code: string;
  template_version: number;
  source_fingerprint: string;
  source_changed: boolean;
  consent_current: boolean;
  created_by: number;
  created_at: string;
  can_confirm: boolean;
  event: Reminder;
  events: {
    id: number;
    kind: string;
    notes: string | null;
    created_by: number;
    created_at: string;
  }[];
}
export interface ReportedPayment {
  id: number;
  obligation_id: number | null;
  account_id: number | null;
  reporting_person_id: number;
  concept: string;
  amount: string;
  reported_on: string;
  method_id: number;
  document_reference: string;
  notes: string | null;
  version: number;
  property_id: number;
  person_id: number;
  currency: string;
  state: string;
  movement_id: number | null;
  recorded_by: number;
  recorded_at: string;
  decisions: {
    id: number;
    kind: string;
    movement_id: number | null;
    reason: string;
    created_by: number;
    created_at: string;
  }[];
}
export interface MessageResult {
  communication_id: number;
  version: number;
  authorization_operation_id?: number;
  url?: string;
}
export interface ReminderTarget {
  propertyId: number;
  noticeKey?: string;
}

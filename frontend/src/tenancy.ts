export type Mode = "daily" | "weekly" | "monthly" | "anticretico" | "mixed";
export const modeNames: Record<Mode, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  anticretico: "Anticrético",
  mixed: "Mixto · solo borrador",
};
export const stateNames: Record<string, string> = {
  draft: "Borrador",
  active: "Vigente",
  finished: "Finalizado",
  cancelled: "Cancelado",
  pending: "Pendiente",
  confirmed: "Confirmada",
  expired: "Vencida",
  converted: "Convertida en contrato",
  available: "Disponible",
  reserved: "Reservado",
  occupied: "Ocupado",
  maintenance: "En mantenimiento",
  disabled: "Deshabilitado",
};
export interface Target {
  target_label: string;
  property_id: number | null;
  unit_id: number | null;
  resolved_property_id: number;
  start_date: string;
  end_date: string;
  mode: Mode;
  version: number;
}
export interface Contract extends Target {
  id: number;
  responsible_person_id: number;
  occupant_ids: number[];
  owners: { person_id: number; share: string | null }[];
  source_reservation_id: number | null;
  status: "draft" | "active" | "finished" | "cancelled";
  actual_end_date: string | null;
  price: string | null;
  currency: string;
  daily_count: "inclusive" | "nights" | null;
  weekly_partial_allowed: boolean | null;
  monthly_period: "anniversary" | "calendar" | null;
  first_period: "full" | "prorated" | null;
  due_day: number | null;
  payment_timing: string;
  due_terms: string | null;
  services_included: boolean;
  service_terms: string | null;
  conditions: string | null;
  notes: string | null;
  allows_service_charges: boolean;
  periods: {
    occupancy_days: number;
    contracted_days: number;
    billable_days: number | null;
    full_weeks: number | null;
    partial_days: number | null;
    monthly_periods: {
      start: string;
      end: string;
      period_days: number;
      occupied_days: number;
      first_period_rule: string | null;
      due_date: string | null;
    }[];
  };
}
export interface Reservation extends Target {
  id: number;
  person_id: number;
  status: string;
  effective_status: string;
  expires_at: string | null;
  notes: string | null;
}
export interface AvailabilityItem {
  unit_id: number | null;
  label: string;
  state: string;
  reason: string;
  blockers: { kind: string; id: number; reason: string }[];
}
export interface Availability {
  property_id: number;
  property_name: string;
  start_date: string;
  end_date: string;
  whole: AvailabilityItem;
  units: AvailabilityItem[];
}
export interface HistoryEntry {
  id: number;
  action: string;
  created_at: string;
  details: {
    before: Partial<Contract> | null;
    after: Partial<Contract>;
    reason: string | null;
  };
}
export interface Occupancy extends Contract {
  current: boolean;
  history: HistoryEntry[];
}
export function localToday() {
  // Misma fecha de negocio que el backend, aunque el dispositivo esté en otra zona.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function daysBetween(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
        86400000,
    ) + 1
  );
}
export function addDays(start: string, days: number) {
  return new Date(Date.parse(start + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function showDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = value.slice(0, 10).split("-");
  return `${date[2]}/${date[1]}/${date[0]}`;
}

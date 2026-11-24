import type { Availability, AvailabilityState } from "../tenancy";
import { stateNames } from "../tenancy";

export const availabilityStates = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
  "disabled",
] as const;

const states = {
  available: { icon: "✓", label: stateNames.available },
  occupied: { icon: "🔒︎", label: stateNames.occupied },
  reserved: { icon: "▦", label: stateNames.reserved },
  maintenance: { icon: "⚒", label: stateNames.maintenance },
  disabled: { icon: "⊘", label: stateNames.disabled },
  enabled: { icon: "✓", label: "Habilitado" },
  noMaintenance: { icon: "–", label: "Sin mantenimiento marcado" },
  unoccupied: { icon: "–", label: "Sin ocupación" },
};

export function PropertyStatus({
  state,
  label,
}: {
  state: keyof typeof states;
  label?: string;
}) {
  return (
    <span className={`property-status property-status--${state}`}>
      <span aria-hidden="true">{states[state].icon}</span>
      <span>{label ?? states[state].label}</span>
    </span>
  );
}

const summaryLabels: Record<AvailabilityState, [string, string]> = {
  available: ["disponible", "disponibles"],
  occupied: ["ocupado", "ocupados"],
  reserved: ["reservado", "reservados"],
  maintenance: ["en mantenimiento", "en mantenimiento"],
  disabled: ["deshabilitado", "deshabilitados"],
};

export function AvailabilitySummary({
  summary,
}: {
  summary: Availability["summary"];
}) {
  return (
    <ul
      className="availability-summary"
      aria-label="Resumen de cuartos por estado"
    >
      <li>
        <strong>
          {availabilityStates.reduce(
            (total, state) => total + summary[state],
            0,
          )}
        </strong>{" "}
        Cuartos en total
      </li>
      {availabilityStates.map((state) => (
        <li key={state}>
          <PropertyStatus
            state={state}
            label={`${summary[state]} ${summaryLabels[state][summary[state] === 1 ? 0 : 1]}`}
          />
        </li>
      ))}
    </ul>
  );
}

export function WholePropertyAvailability({
  whole,
}: {
  whole: Availability["whole"];
}) {
  return (
    <section className="whole-availability" data-state={whole.state}>
      <h3>Alquiler de la casa completa</h3>
      <p>
        <strong>
          {whole.state === "available" ? "Disponible" : "No disponible"}
        </strong>{" "}
        · {whole.reason}
      </p>
    </section>
  );
}

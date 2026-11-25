import { StatusIndicator } from "./StatusIndicator";
import type { StatusTone } from "./StatusIndicator";
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
  available: { tone: "green", icon: "✓", label: stateNames.available },
  occupied: { tone: "red", icon: "🔒︎", label: stateNames.occupied },
  reserved: { tone: "amber", icon: "▦", label: stateNames.reserved },
  maintenance: { tone: "purple", icon: "⚒", label: stateNames.maintenance },
  disabled: { tone: "gray", icon: "⊘", label: stateNames.disabled },
  enabled: { tone: "blue", icon: "✓", label: "Habilitado" },
  noMaintenance: {
    tone: "gray",
    icon: "–",
    label: "Sin mantenimiento marcado",
  },
  unoccupied: { tone: "gray", icon: "–", label: "Sin ocupación" },
} satisfies Record<string, { tone: StatusTone; icon: string; label: string }>;

export function PropertyStatus({
  state,
  label,
}: {
  state: keyof typeof states;
  label?: string;
}) {
  return (
    <StatusIndicator
      {...states[state]}
      label={label ?? states[state].label}
      className={`property-status property-status--${state}`}
    />
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

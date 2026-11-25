import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { RecordStatus } from "../src/components/StatusIndicator";
import { PropertyStatus } from "../src/components/PropertyStatus";

test.each([
  ["contract", "active", "Vigente", "blue"],
  ["contract", "finished", "Finalizado", "green"],
  ["contract", "cancelled", "Cancelado", "gray"],
  ["reservation", "confirmed", "Confirmada", "amber"],
  ["reservation", "expired", "Vencida", "red"],
  ["finance", "overdue", "Vencido", "red"],
  ["finance", "partial", "Pagado parcialmente", "amber"],
  ["finance", "paid", "Pagado", "green"],
  ["movement", "registered", "Registrado", "green"],
  ["movement", "held", "Retenida", "blue"],
  ["movement", "voided", "Anulado", "gray"],
  ["capital", "received", "Capital recibido; restitución pendiente", "amber"],
  ["capital", "returned", "Restituido completamente", "green"],
  ["distribution", "calculated", "Calculado · pendiente de confirmar", "amber"],
  ["distribution", "confirmed", "Confirmado", "green"],
  ["priority", "upcoming", "Próximo a vencer", "amber"],
  ["priority", "today", "Vence hoy", "amber"],
  ["priority", "overdue", "Vencido", "red"],
  ["priority", "date_missing", "Pendiente de revisión", "amber"],
  ["priority", "resolved", "Resuelto por el origen", "green"],
  ["priority", "scheduled", "Fuera del plazo de avisos", "gray"],
  ["attention", "pending", "Requiere atención", "amber"],
  ["attention", "reviewed", "Revisado", "blue"],
  ["attention", "snoozed", "Pospuesto", "amber"],
  ["attention", "resolved", "Resuelto", "green"],
  ["attention", "scheduled", "Fuera del plazo de avisos", "gray"],
  ["communication", "prepared", "Mensaje preparado", "amber"],
  ["communication", "manual_sent", "Envío confirmado manualmente", "blue"],
  ["communication", "not_sent", "No enviado o cancelado", "gray"],
  [
    "paymentReport",
    "verified",
    "Verificado y vinculado a dinero real",
    "green",
  ],
  [
    "paymentReport",
    "verification_invalid",
    "Revisar: el movimiento o su aplicación dejó de ser válido",
    "red",
  ],
] as const)(
  "%s %s tiene un indicador contextual",
  (domain, state, label, tone) => {
    render(<RecordStatus domain={domain} state={state} />);
    const indicator = screen.getByText(label).closest("[data-tone]");
    expect(indicator).toHaveAttribute("data-tone", tone);
    expect(
      indicator?.querySelector("[aria-hidden=true]"),
    ).not.toBeEmptyDOMElement();
  },
);

test.each([
  ["available", "Disponible", "green"],
  ["occupied", "Ocupado", "red"],
  ["reserved", "Reservado", "amber"],
  ["maintenance", "En mantenimiento", "purple"],
  ["disabled", "Deshabilitado", "gray"],
] as const)(
  "disponibilidad %s conserva el estado y los tonos",
  (state, label, tone) => {
    render(<PropertyStatus state={state} />);
    expect(screen.getByText(label).closest("[data-tone]")).toHaveAttribute(
      "data-tone",
      tone,
    );
  },
);

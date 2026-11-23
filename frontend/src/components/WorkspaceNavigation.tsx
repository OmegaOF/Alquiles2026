import { useState } from "react";

type Section = { page: string; label: string; admin?: true };
type Group = { label: string; icon: string; sections: readonly Section[] };

const groups = [
  { label: "Inicio", icon: "⌂", sections: [
    { page: "home", label: "Resumen" },
    { page: "reminders", label: "Avisos" },
    { page: "pending", label: "Pendientes" },
  ] },
  { label: "Casas y cuartos", icon: "▤", sections: [
    { page: "properties", label: "Mis casas" },
    { page: "rooms", label: "Cuartos" },
    { page: "availability", label: "Disponibilidad" },
  ] },
  { label: "Alquileres", icon: "▧", sections: [
    { page: "contracts", label: "Contratos" },
    { page: "reservations", label: "Reservas" },
    { page: "tenants", label: "Inquilinos" },
    { page: "anticreticos", label: "Anticréticos" },
  ] },
  { label: "Cobros y gastos", icon: "↔", sections: [
    { page: "finances", label: "Cobros" },
    { page: "debts", label: "Deudas" },
    { page: "utilities", label: "Servicios" },
    { page: "expenses", label: "Gastos" },
  ] },
  { label: "Reportes", icon: "▥", sections: [
    { page: "reports", label: "Ingresos" },
    { page: "report-occupancy", label: "Ocupación" },
    { page: "report-history", label: "Historial" },
    { page: "report-pdf", label: "PDF" },
  ] },
  { label: "Configuración", icon: "⚙", sections: [
    { page: "persons", label: "Personas" },
    { page: "users", label: "Usuarios", admin: true },
    { page: "security", label: "Seguridad" },
  ] },
] as const satisfies readonly Group[];

type SectionPage = (typeof groups)[number]["sections"][number]["page"];
export type WorkspacePage = SectionPage | "dashboard" | "occupancy";

const parentPage: Partial<Record<WorkspacePage, SectionPage>> = {
  dashboard: "home",
  occupancy: "tenants",
};

export function WorkspaceNavigation({
  page,
  general,
  navigate,
}: {
  page: WorkspacePage;
  general: boolean;
  navigate: (page: WorkspacePage) => void;
}) {
  const section = parentPage[page] ?? page;
  const group = groups.find((item) => item.sections.some((option) => option.page === section)) ?? groups[0];
  const sections: readonly Section[] = group.sections;
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <nav className="group-nav" aria-label="Navegación principal">
        <button
          type="button"
          className="secondary group-menu-toggle"
          aria-expanded={mobileOpen}
          aria-controls="workspace-groups"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span aria-hidden="true">☰</span> {group.label} <span className="sr-only">· Cambiar grupo</span>
        </button>
        <div className="group-list" id="workspace-groups" data-open={mobileOpen}>
          {groups.map((item) => (
            <button
              type="button"
              key={item.label}
              aria-current={item === group ? "true" : undefined}
              onClick={() => {
                if (item !== group) navigate(item.sections[0].page);
                setMobileOpen(false);
              }}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <nav className="section-nav" aria-label={`Opciones de ${group.label}`}>
        {sections.filter((option) => !option.admin || general).map((option) => (
          <button
            type="button"
            key={option.page}
            aria-current={section === option.page ? "page" : undefined}
            onClick={() => navigate(option.page as SectionPage)}
          >
            {option.label}
          </button>
        ))}
      </nav>
    </>
  );
}

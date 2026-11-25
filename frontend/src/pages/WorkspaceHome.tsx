import { useListRequest } from "../components/RecordList";
import { StatusIndicator } from "../components/StatusIndicator";
import type { StatusTone } from "../components/StatusIndicator";
import type { WorkspacePage } from "../components/WorkspaceNavigation";
import type { ReportData } from "../reports";
import { money } from "../reports";
import type { Property, User } from "../types";

export function WorkspaceHome({
  user,
  properties,
  navigate,
}: {
  user: User;
  properties: Property[];
  navigate: (page: WorkspacePage) => void;
}) {
  const overview = useListRequest<Pick<ReportData, "summary" | "counts">>(
    properties.length ? "/dashboard/overview" : null,
  );
  const attention = useListRequest<{ count: number | null }>(
    properties.length ? "/dashboard/attention" : null,
  );
  const report = overview.data;
  const pending =
    report?.summary?.filter((row) => Number(row.pending) > 0) ?? [];
  const awaiting = overview.error ? "Sin datos" : "Consultando…";
  const rows: {
    title: string;
    value: string | number;
    tone: StatusTone;
    page: WorkspacePage;
    action: string;
  }[] = [
    {
      title: "Casas registradas",
      value: properties.length,
      tone: "blue",
      page: "properties",
      action: "Consultar casas",
    },
    {
      title: "Cuartos disponibles",
      value:
        report?.counts?.units_available ?? (properties.length ? awaiting : 0),
      tone: "green",
      page: "availability",
      action: "Consultar disponibilidad",
    },
    {
      title: "Deudas pendientes",
      value: pending.length
        ? pending.map((row) => money(row.pending, row.currency)).join(" · ")
        : report || !properties.length
          ? "Sin saldos pendientes"
          : awaiting,
      tone: pending.length
        ? "amber"
        : report || !properties.length
          ? "green"
          : "gray",
      page: "debts",
      action: "Consultar deudas",
    },
    {
      title: "Contratos próximos a vencer",
      value:
        report?.counts?.contracts_ending ?? (properties.length ? awaiting : 0),
      tone: report?.counts?.contracts_ending ? "amber" : "blue",
      page: "contracts",
      action: "Consultar contratos",
    },
    {
      title: "Avisos que requieren atención",
      value: !properties.length
        ? 0
        : (attention.data?.count ??
          (attention.error || attention.data ? "Sin datos" : "Consultando…")),
      tone: attention.data?.count ? "amber" : "gray",
      page: "pending",
      action: "Ver pendientes",
    },
  ];

  return (
    <section className="workspace-home">
      <h1>Inicio</h1>
      <p>Hola, {user.display_name || user.full_name}.</p>
      <h2>Resumen</h2>
      <ul className="home-summary">
        {rows.map(({ title, value, tone, page, action }) => (
          <li key={page}>
            <strong>{title}</strong>
            <StatusIndicator tone={tone} label={String(value)} />
            <button className="secondary" onClick={() => navigate(page)}>
              {action}
            </button>
          </li>
        ))}
      </ul>
      <div className="record-row-actions home-links">
        <button className="secondary" onClick={() => navigate("reminders")}>
          Ver avisos
        </button>
        <button className="secondary" onClick={() => navigate("dashboard")}>
          Ver resumen detallado
        </button>
      </div>
    </section>
  );
}

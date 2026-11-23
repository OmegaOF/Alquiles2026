import { useEffect, useState } from "react";
import { api } from "../api";
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
  const [report, setReport] = useState<ReportData>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!properties.length) return;
    let current = true;
    api<ReportData>("/dashboard")
      .then((data) => { if (current) setReport(data); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [properties.length]);

  return (
    <section className="workspace-home">
      <header className="home-intro">
        <div>
          <h1>Inicio</h1>
          <p>Hola, {user.display_name || user.full_name}.</p>
        </div>
        <button className="secondary" onClick={() => navigate("dashboard")}>Ver resumen detallado</button>
      </header>
      <div className="home-cards">
        <article>
          <h2>Mis casas</h2>
          <strong className="home-number">{properties.length}</strong>
          <p>{properties.length ? "Casas a las que tienes acceso." : "Todavía no tienes casas disponibles."}</p>
          <button className="secondary" onClick={() => navigate("properties")}>Consultar casas</button>
        </article>
        <article>
          <h2>Deudas pendientes</h2>
          {failed ? <p role="status">No se pudieron consultar los saldos.</p>
            : !properties.length ? <p>Aún no hay casas para consultar.</p>
            : !report ? <p role="status">Consultando saldos…</p>
            : report.summary?.length ? (
              <ul className="home-balances">
                {report.summary.map((row) => (
                  <li key={row.currency}>{money(row.pending, row.currency)}</li>
                ))}
              </ul>
            ) : <p>Sin saldos para mostrar.</p>}
          <button className="secondary" onClick={() => navigate("debts")}>Consultar deudas</button>
        </article>
        <article>
          <h2>Avisos</h2>
          <p>Revisa vencimientos de contratos, alquileres y servicios.</p>
          <button className="secondary" onClick={() => navigate("reminders")}>Ver avisos</button>
        </article>
      </div>
      <section className="panel home-actions" aria-labelledby="home-actions">
        <h2 id="home-actions">Accesos rápidos</h2>
        <div className="actions">
          <button onClick={() => navigate("contracts")}>Consultar contratos</button>
          <button className="secondary" onClick={() => navigate("availability")}>Consultar disponibilidad</button>
          <button className="secondary" onClick={() => navigate("pending")}>Ver pendientes</button>
        </div>
      </section>
    </section>
  );
}

import { useState } from "react";
import { checkConnection } from "./api";

export function App() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  async function verify() {
    setState("loading");
    try {
      await checkConnection();
      setState("ok");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="layout">
      <a className="skip" href="#contenido">
        Ir al contenido
      </a>
      <aside>
        <a className="brand" href="/" aria-label="Mi Casa, inicio">
          <span aria-hidden="true">⌂</span> Mi Casa
        </a>
        <p className="brand-note">Administración de propiedades</p>
        <nav aria-label="Navegación principal">
          <a className="selected" href="#contenido" aria-current="page">
            Inicio
          </a>
        </nav>
        <div className="sidebar-note">
          Paso a paso,
          <br />
          todo en su lugar.
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>Tu espacio de administración</span>
          <span className="badge">Configuración inicial</span>
        </header>
        <main id="contenido">
          <p className="eyebrow">BIENVENIDO A MI CASA</p>
          <h1>
            Un lugar para tener
            <br />
            todo en orden.
          </h1>
          <p className="intro">
            Administra tus propiedades con claridad y tranquilidad.
            <br />
            Estamos preparando las herramientas para acompañarte.
          </p>
          <section className="connection" aria-labelledby="connection-title">
            <div>
              <span className="step">01 · PRIMEROS PASOS</span>
              <h2 id="connection-title">Comprobar el sistema</h2>
              <p>
                Verifica que la aplicación y la base de datos estén disponibles.
              </p>
              <p role="status" aria-live="polite">
                {state === "idle"
                  ? "Todavía no se ha comprobado la conexión."
                  : state === "loading"
                    ? "Comprobando la conexión…"
                    : state === "ok"
                      ? "Conexión correcta. El sistema está disponible."
                      : "No se pudo conectar con el sistema. Revisa que esté iniciado y vuelve a intentar."}
              </p>
              <button onClick={verify} disabled={state === "loading"}>
                {state === "loading"
                  ? "Comprobando…"
                  : state === "error"
                    ? "Volver a intentar"
                    : "Comprobar conexión"}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
            <div className="house-art" aria-hidden="true">
              <div className="roof" />
              <div className="house">
                <div className="window" />
                <div className="door" />
              </div>
              <div className="ground" />
            </div>
          </section>
          <section aria-labelledby="next-title">
            <h2 id="next-title">Lo que viene después</h2>
            <p className="muted">
              Estas herramientas se habilitarán en las siguientes etapas.
            </p>
            <div className="cards">
              {[
                [
                  "01",
                  "Tus propiedades",
                  "Casas, cuartos y propietarios en un solo lugar.",
                ],
                [
                  "02",
                  "Tus contratos",
                  "Fechas y condiciones fáciles de consultar.",
                ],
                ["03", "Tus cuentas", "Cobros y gastos con información clara."],
              ].map(([n, title, description]) => (
                <article key={n}>
                  <span className="number">{n}</span>
                  <span className="coming">Próximamente</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </section>
          <footer>
            Mi Casa · Una administración más sencilla{" "}
            <span>Etapa 0 · Base del sistema</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

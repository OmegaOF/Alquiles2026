import { useEffect, useRef, useState } from "react";
import { api, ApiError, checkConnection } from "./api";
import type { Person, Property, User } from "./types";
import type { AvailabilityAction, AvailabilityQuery } from "./tenancy";
import { roleNames } from "./types";
import { Properties } from "./pages/Properties";
import { People } from "./pages/People";
import { Users } from "./pages/Users";
import { Tenancy } from "./pages/Tenancy";
import { OccupancyScreen } from "./pages/tenancy/Screens";
import { Utilities } from "./pages/Utilities";
import { Finances } from "./pages/Finances";
import { Anticreticos } from "./pages/Anticreticos";
import type { CapitalTarget } from "./anticreticos";
import { Reminders } from "./pages/Reminders";
import type { ReminderTarget } from "./reminders";
import { Reports } from "./pages/Reports";
import {
  ErrorMessage,
  Field,
  errorText,
  confirmFormDiscard,
} from "./components/Form";
import { WorkspaceNavigation } from "./components/WorkspaceNavigation";
import type { WorkspacePage } from "./components/WorkspaceNavigation";
import { WorkspaceHome } from "./pages/WorkspaceHome";
import "./workspace.css";
export { PhaseZero } from "./PhaseZero";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  async function checkSession() {
    setLoading(true);
    setError("");
    try {
      setUser(await api<User>("/auth/me"));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void checkSession();
    function sessionExpired() {
      setUser(null);
      setExpired(true);
    }
    window.addEventListener("session-expired", sessionExpired);
    return () => window.removeEventListener("session-expired", sessionExpired);
  }, []);
  if (loading)
    return (
      <div className="session-loading" role="status">
        Preparando tu espacio…
      </div>
    );
  if (!user)
    return (
      <Login
        initialError={error}
        expired={expired}
        onLogin={(u) => {
          setUser(u);
          setExpired(false);
          setError("");
        }}
      />
    );
  return (
    <Workspace
      key={user.id}
      user={user}
      onUserChange={setUser}
      onLogout={() => {
        setUser(null);
        setExpired(false);
      }}
    />
  );
}

function Login({
  initialError,
  expired,
  onLogin,
}: {
  initialError: string;
  expired: boolean;
  onLogin: (user: User) => void;
}) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api<User>("/auth/login", "POST", {
          username: String(data.get("username") || "").trim(),
          password: String(data.get("password") || ""),
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <div className="login-intro">
        <p className="brand">
          <span aria-hidden="true">⌂</span> Mi Casa
        </p>
        <p className="eyebrow">ADMINISTRACIÓN DE PROPIEDADES</p>
        <h2 className="login-slogan">
          Todo en su lugar.
          <br />
          Con tranquilidad.
        </h2>
        <p>Un espacio sencillo para organizar tus casas, cuartos y personas.</p>
        <div className="login-decoration" aria-hidden="true">
          ⌂
        </div>
        <p className="login-note">
          Tus datos, con acceso solo para las personas autorizadas.
        </p>
      </div>
      <main className="login-main">
        <section className="login-card">
          <p className="eyebrow">BIENVENIDO A MI CASA</p>
          <h1>Iniciar sesión</h1>
          <p>Ingresa con la cuenta que te entregó el administrador.</p>
          {expired && (
            <p role="status" className="permission-note">
              Tu sesión terminó. Ingresa nuevamente para continuar.
            </p>
          )}
          <ErrorMessage message={error} />
          <form onSubmit={login}>
            <Field label="Nombre de usuario">
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label="Contraseña">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            <button type="submit" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar al sistema"}
            </button>
          </form>
          <p className="muted">
            Si no tienes una cuenta o no recuerdas tu contraseña, comunícate con
            el administrador general.
          </p>
        </section>
      </main>
    </div>
  );
}

function Workspace({
  user,
  onLogout,
  onUserChange,
}: {
  user: User;
  onLogout: () => void;
  onUserChange: (user: User) => void;
}) {
  const [page, setPage] = useState<WorkspacePage>("home");
  const main = useRef<HTMLElement>(null);
  const [availabilityContext, setAvailabilityContext] = useState<{
    action: AvailabilityAction;
    query: AvailabilityQuery;
  } | null>(null);
  const [availabilityQuery, setAvailabilityQuery] =
    useState<AvailabilityQuery>();
  function navigate(
    target: WorkspacePage,
    context: typeof availabilityContext = null,
    restoreQuery?: AvailabilityQuery,
  ) {
    if (
      target === page ||
      !confirmFormDiscard(
        main.current?.querySelector("form[data-dirty]") ?? null,
      )
    )
      return;
    setAvailabilityContext(context);
    setAvailabilityQuery(restoreQuery);
    setPage(target);
    requestAnimationFrame(() => main.current?.focus());
  }
  function openAvailabilityAction(
    action: AvailabilityAction,
    query: AvailabilityQuery,
  ) {
    const target =
      action.kind === "unit"
        ? "rooms"
        : action.kind === "reservation" || action.kind === "reserve"
          ? "reservations"
          : "contracts";
    navigate(target, { action, query });
  }
  const [capitalTarget, setCapitalTarget] = useState<CapitalTarget | null>(
    null,
  );
  const [financeTarget, setFinanceTarget] = useState<number | null>(null);
  const [obligationTarget, setObligationTarget] = useState<
    number | undefined
  >();
  const [reminderTarget, setReminderTarget] = useState<ReminderTarget | null>(
    null,
  );
  const [contractTarget, setContractTarget] = useState<number | null>(null);
  const [utilityTarget, setUtilityTarget] = useState<number | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<number | undefined>();
  const [tenancyProperty, setTenancyProperty] = useState<number | undefined>();
  const [properties, setProperties] = useState<Property[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const general = user.role === "general_admin";
  async function refresh() {
    let current: User;
    try {
      current = await api<User>("/auth/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        window.dispatchEvent(new Event("session-expired"));
      throw e;
    }
    onUserChange(current);
    const [nextProperties, nextPeople, nextUsers] = await Promise.all([
      api<Property[]>("/properties"),
      api<Person[]>("/persons"),
      current.role === "general_admin"
        ? api<User[]>("/users")
        : Promise.resolve([]),
    ]);
    setProperties(nextProperties);
    setPeople(nextPeople);
    setUsers(nextUsers);
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (main.current?.querySelector("form[data-dirty]"))
        event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  async function logout() {
    if (
      !confirmFormDiscard(
        main.current?.querySelector("form[data-dirty]") ?? null,
      ) ||
      !window.confirm("¿Cerrar tu sesión en Mi Casa?")
    )
      return;
    setLogoutBusy(true);
    try {
      await api("/auth/logout", "POST");
      onLogout();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLogoutBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <a href="#contenido" className="skip">
        Ir al contenido
      </a>
      <header className="app-header">
        <div className="app-brand">
          <span aria-hidden="true">⌂</span> Mi Casa
        </div>
        <div className="app-account">
          <strong>{user.full_name}</strong>
          {user.display_name && (
            <span className="role-label">
              Alias de la cuenta: {user.display_name}
            </span>
          )}
          <span className="role-label">{roleNames[user.role]}</span>
        </div>
        <button
          className="secondary logout"
          onClick={() => void logout()}
          disabled={logoutBusy}
        >
          {logoutBusy ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </header>
      <WorkspaceNavigation page={page} general={general} navigate={navigate} />
      <main ref={main} id="contenido" className="app-content" tabIndex={-1}>
        <ErrorMessage message={error} />
        {availabilityContext &&
          ["rooms", "contracts", "reservations"].includes(page) && (
            <button
              className="text-button"
              onClick={() =>
                navigate("availability", null, availabilityContext.query)
              }
            >
              ← Volver a disponibilidad
            </button>
          )}
        {loading ? (
          <p role="status">Cargando tu información…</p>
        ) : error ? (
          <button className="secondary" onClick={() => void load()}>
            Volver a cargar
          </button>
        ) : page === "dashboard" ||
          page === "reports" ||
          page.startsWith("report-") ? (
          <Reports
            key={page}
            view={page === "dashboard" ? "dashboard" : "reports"}
            section={
              page === "report-occupancy"
                ? "occupancy"
                : page === "report-history"
                  ? "history"
                  : page === "report-pdf"
                    ? "pdf"
                    : undefined
            }
          />
        ) : page === "properties" || page === "rooms" ? (
          <Properties
            key={page}
            rooms={page === "rooms"}
            initialRoom={
              availabilityContext?.action.kind === "unit"
                ? availabilityContext.action
                : undefined
            }
            properties={properties}
            people={people}
            users={users}
            user={user}
            refresh={refresh}
            onHouseAction={(target, propertyId) => {
              if (target === "utilities") {
                setUtilityTarget(propertyId);
                setReceiptTarget(undefined);
              } else if (target === "finances") {
                setFinanceTarget(propertyId);
                setObligationTarget(undefined);
              } else {
                setTenancyProperty(propertyId);
                setContractTarget(null);
              }
              navigate(target);
            }}
          />
        ) : page === "tenants" ? (
          <OccupancyScreen
            heading="Inquilinos"
            properties={properties}
            people={people}
          />
        ) : page === "persons" ? (
          <People people={people} canEdit={general} refresh={refresh} />
        ) : ["contracts", "reservations", "availability", "occupancy"].includes(
            page,
          ) ? (
          <Tenancy
            key={page}
            view={
              page as
                | "contracts"
                | "reservations"
                | "availability"
                | "occupancy"
            }
            user={user}
            properties={properties}
            people={people}
            refreshPeople={refresh}
            users={users}
            initialPropertyId={tenancyProperty}
            initialContractId={
              availabilityContext ? undefined : contractTarget || undefined
            }
            availabilityAction={availabilityContext?.action}
            availabilityQuery={availabilityQuery}
            onAvailabilityAction={openAvailabilityAction}
            onCapital={(contract) => {
              setCapitalTarget({
                propertyId: contract.resolved_property_id,
                contractId: contract.id,
              });
              navigate("anticreticos");
            }}
          />
        ) : page === "utilities" ? (
          <Utilities
            user={user}
            properties={properties}
            people={people}
            initialPropertyId={utilityTarget || undefined}
            initialReceiptId={receiptTarget}
          />
        ) : page === "finances" || page === "debts" || page === "expenses" ? (
          <Finances
            key={page}
            section={
              page === "debts"
                ? "debts"
                : page === "expenses"
                  ? "expenses"
                  : "receivable"
            }
            user={user}
            properties={properties}
            people={people}
            initialPropertyId={financeTarget || undefined}
            initialObligationId={
              page === "debts" ? obligationTarget : undefined
            }
            onPropertyChange={(id) => {
              setFinanceTarget(id);
              setObligationTarget(undefined);
            }}
            onReminders={(propertyId) => {
              setReminderTarget({ propertyId });
              setPage("reminders");
            }}
            onCapital={(propertyId) => {
              setCapitalTarget({ propertyId });
              setPage("anticreticos");
            }}
          />
        ) : page === "anticreticos" ? (
          <Anticreticos
            user={user}
            properties={properties}
            people={people}
            initialTarget={capitalTarget}
            onContracts={() => setPage("contracts")}
            onFinances={(propertyId) => {
              setFinanceTarget(propertyId);
              setPage("finances");
            }}
          />
        ) : page === "reminders" || page === "pending" ? (
          <Reminders
            key={page}
            pending={page === "pending"}
            user={user}
            properties={properties}
            initialTarget={reminderTarget}
            onOrigin={(propertyId, origin) => {
              if (origin.module === "anticreticos") {
                setCapitalTarget({
                  propertyId,
                  contractId: origin.contract_id,
                });
                setPage("anticreticos");
              } else if (origin.module === "contracts") {
                setContractTarget(origin.contract_id || null);
                setPage("contracts");
              } else if (origin.module === "utilities") {
                setUtilityTarget(propertyId);
                setReceiptTarget(origin.receipt_id);
                setPage("utilities");
              } else {
                setFinanceTarget(propertyId);
                setObligationTarget(origin.obligation_id);
                setPage(
                  origin.obligation_id
                    ? "debts"
                    : origin.expense_id
                      ? "expenses"
                      : "finances",
                );
              }
            }}
          />
        ) : page === "users" && general ? (
          <Users
            users={users}
            people={people}
            properties={properties}
            currentUser={user}
            refresh={refresh}
          />
        ) : page === "security" ? (
          <Security user={user} />
        ) : (
          <WorkspaceHome
            user={user}
            properties={properties}
            navigate={navigate}
          />
        )}
      </main>
    </div>
  );
}

function Security({ user }: { user: User }) {
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
    <section>
      <h1>Seguridad</h1>
      <div className="panel">
        <h2>Tu cuenta</h2>
        <p>
          {user.username} · {roleNames[user.role]}
        </p>
        <p>
          Si necesitas recuperar tu contraseña o cambiar tu acceso, comunícate
          con el administrador general.
        </p>
      </div>
      <section className="connection" aria-labelledby="connection-title">
        <div>
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
          <button disabled={state === "loading"} onClick={() => void verify()}>
            {state === "loading"
              ? "Comprobando…"
              : state === "error"
                ? "Volver a intentar"
                : "Comprobar conexión"}
          </button>
        </div>
      </section>
    </section>
  );
}

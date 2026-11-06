import { useEffect, useState } from "react";
import { api, ApiError, checkConnection } from "./api";
import type { Person, Property, User } from "./types";
import { roleNames } from "./types";
import { Properties } from "./pages/Properties";
import { People } from "./pages/People";
import { Users } from "./pages/Users";
import { ErrorMessage, Field, errorText } from "./components/Form";
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

type Page = "home" | "properties" | "persons" | "users";
function Workspace({
  user,
  onLogout,
  onUserChange,
}: {
  user: User;
  onLogout: () => void;
  onUserChange: (user: User) => void;
}) {
  const [page, setPage] = useState<Page>("properties");
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
  async function logout() {
    if (!window.confirm("¿Cerrar tu sesión en Mi Casa?")) return;
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
  const links: [Page, string][] = [
    ["home", "Inicio"],
    ["properties", "Propiedades"],
    ["persons", "Personas"],
  ];
  if (general) links.push(["users", "Usuarios y permisos"]);
  return (
    <div className="layout">
      <a href="#contenido" className="skip">
        Ir al contenido
      </a>
      <aside>
        <p className="brand">
          <span aria-hidden="true">⌂</span> Mi Casa
        </p>
        <p className="brand-note">Administración de propiedades</p>
        <nav aria-label="Navegación principal">
          {links.map(([id, label]) => (
            <button
              key={id}
              className={`nav-button ${page === id ? "selected" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          Paso a paso,
          <br />
          todo en su lugar.
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
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
        <main id="contenido" tabIndex={-1}>
          <ErrorMessage message={error} />
          {loading ? (
            <p role="status">Cargando tu información…</p>
          ) : error ? (
            <button className="secondary" onClick={() => void load()}>
              Volver a cargar
            </button>
          ) : page === "properties" ? (
            <Properties
              properties={properties}
              people={people}
              users={users}
              user={user}
              refresh={refresh}
            />
          ) : page === "persons" ? (
            <People people={people} canEdit={general} refresh={refresh} />
          ) : page === "users" && general ? (
            <Users
              users={users}
              people={people}
              properties={properties}
              currentUser={user}
              refresh={refresh}
            />
          ) : (
            <Home user={user} properties={properties} />
          )}
          <footer>
            Mi Casa · Una administración más sencilla
            <span>Propiedades, personas y acceso</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Home({ user, properties }: { user: User; properties: Property[] }) {
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
      <p className="eyebrow">TU ESPACIO DE ADMINISTRACIÓN</p>
      <h1>Bienvenido, {user.full_name}.</h1>
      <p className="intro">
        Organiza tus propiedades con claridad y tranquilidad.
      </p>
      <div className="panel">
        <h2>Tu información disponible</h2>
        <p>
          Tienes acceso a {properties.length}{" "}
          {properties.length === 1 ? "propiedad" : "propiedades"}. Usa el menú
          para consultar sus datos y cuartos.
        </p>
        <p>
          Los contratos y la ocupación se incorporarán en la siguiente etapa.
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

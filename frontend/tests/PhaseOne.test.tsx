import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { Properties } from "../src/pages/Properties";
import { People } from "../src/pages/People";
import type { Person, Property, User } from "../src/types";

const user: User = {
  id: 1,
  username: "ana",
  full_name: "Ana Pérez",
  role: "general_admin",
  person_id: 1,
  display_name: null,
  is_active: true,
  property_ids: [],
};
const property: Property = {
  id: 1,
  name: "Casa Jardín",
  address: "Calle Uno",
  zone: null,
  city: "La Paz",
  description: null,
  is_active: true,
  owners: [{ person_id: 1, share: null }],
  manager_ids: [],
};
const person: Person = {
  id: 1,
  full_name: "María López",
  document: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  is_owner: true,
};
function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("inicio de sesión conserva la contraseña exacta y usa cookies", async () => {
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith("/auth/me"))
      return response({ detail: "Inicia sesión" }, 401);
    if (url.endsWith("/auth/login"))
      return response({ detail: "Usuario o contraseña incorrectos." }, 401);
    return response([]);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await userEvent.type(
    await screen.findByLabelText("Nombre de usuario"),
    "ana",
  );
  await userEvent.type(
    screen.getByLabelText("Contraseña"),
    "  clave de prueba  ",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Ingresar al sistema" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Usuario o contraseña incorrectos",
  );
  const login = fetcher.mock.calls.find((call) =>
    call[0].endsWith("/auth/login"),
  )!;
  expect(JSON.parse(login[1].body).password).toBe("  clave de prueba  ");
  expect(login[1].credentials).toBe("include");
});

test("propietario no ve acciones para registrar ni gestionar usuarios", async () => {
  const owner = { ...user, role: "owner" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/auth/me")
        ? response(owner)
        : url.endsWith("/properties")
          ? response([property])
          : response([person]),
    ),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Casa Jardín" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Registrar propiedad" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Usuarios y permisos" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Ver propiedad/ }));
  expect(
    screen.queryByRole("button", { name: "Editar propiedad" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Registrar cuarto" }),
  ).not.toBeInTheDocument();
});

test("administrador de propiedades edita sin enviar campos de permisos", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(property));
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <Properties
      properties={[property]}
      people={[person]}
      users={[]}
      user={{ ...user, role: "property_admin" }}
      refresh={async () => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Ver propiedad/ }));
  await userEvent.click(
    screen.getByRole("button", { name: "Editar propiedad" }),
  );
  expect(
    screen.queryByLabelText("Propiedad habilitada"),
  ).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Nombre de la propiedad"));
  await userEvent.type(
    screen.getByLabelText("Nombre de la propiedad"),
    "Casa actualizada",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await waitFor(() =>
    expect(fetcher.mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(
      true,
    ),
  );
  const body = JSON.parse(
    fetcher.mock.calls.find((call) => call[1]?.method === "PATCH")![1].body,
  );
  expect(body.name).toBe("Casa actualizada");
  expect(body).not.toHaveProperty("manager_ids");
  expect(body).not.toHaveProperty("owners");
  expect(body).not.toHaveProperty("is_active");
});

test("registro de persona no obliga a tener teléfono, correo ni cuenta", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(person)));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<People people={[]} canEdit refresh={refresh} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Registrar persona" }),
  );
  await userEvent.type(screen.getByLabelText("Nombre completo"), "María López");
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(await screen.findByRole("status")).toHaveTextContent(
    "se guardaron correctamente",
  );
});

test("cancelar confirmación no modifica personas", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<People people={[]} canEdit refresh={async () => {}} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Registrar persona" }),
  );
  await userEvent.type(
    screen.getByLabelText("Nombre completo"),
    "Persona nueva",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Users } from "../src/pages/Users";
import { App } from "../src/App";
import type { Person, User } from "../src/types";

const person: Person = {
  id: 5,
  full_name: "Elena Vargas",
  document: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  is_owner: true,
};
const account: User = {
  id: 2,
  username: "elena",
  full_name: person.full_name,
  person_id: person.id,
  display_name: "Administración central",
  role: "general_admin",
  is_active: true,
  property_ids: [],
};
function response(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setupUsers() {
  const fetcher = vi.fn().mockResolvedValue(response(account));
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <Users
      users={[account]}
      people={[person]}
      properties={[]}
      currentUser={account}
      refresh={async () => {}}
    />,
  );
  return fetcher;
}
async function fillNewAccount() {
  await userEvent.type(
    screen.getByLabelText(/^Nombre de usuario/),
    "operador_prueba",
  );
  await userEvent.type(
    screen.getByLabelText(/^Contraseña/),
    "Clave de prueba segura",
  );
}

test("crear cuenta de una persona existente no duplica su nombre y guarda alias aparte", async () => {
  const fetcher = setupUsers();
  await userEvent.click(
    screen.getByRole("button", { name: "Registrar usuario" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/^Persona vinculada/),
    String(person.id),
  );
  const canonical = screen.getByLabelText(/^Nombre de la persona/);
  expect(canonical).toHaveValue(person.full_name);
  expect(canonical).toHaveAttribute("readonly");
  expect(
    screen.queryByLabelText(/^Nombre completo de la persona/),
  ).not.toBeInTheDocument();
  await fillNewAccount();
  await userEvent.type(
    screen.getByLabelText(/^Alias de la cuenta/),
    "Atención en oficina",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.person_id).toBe(person.id);
  expect(body).not.toHaveProperty("full_name");
  expect(body.display_name).toBe("Atención en oficina");
});

test("registrar persona nueva junto con una cuenta envía un solo nombre personal", async () => {
  const fetcher = setupUsers();
  await userEvent.click(
    screen.getByRole("button", { name: "Registrar usuario" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/^Persona vinculada/),
    "new",
  );
  await userEvent.type(
    screen.getByLabelText(/^Nombre completo de la persona/),
    "Juan Ramírez",
  );
  await fillNewAccount();
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.person_id).toBeNull();
  expect(body.full_name).toBe("Juan Ramírez");
  expect(body.display_name).toBeNull();
  expect(body.role).toBe("operator");
});

test("propietario debe vincularse a una persona propietaria existente", async () => {
  setupUsers();
  await userEvent.click(
    screen.getByRole("button", { name: "Registrar usuario" }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/^Persona vinculada/),
    "new",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Rol de acceso"),
    "owner",
  );
  expect(screen.getByLabelText(/^Propietario vinculado/)).toHaveValue("");
  expect(
    screen.queryByRole("option", { name: "Registrar persona nueva" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText(/^Nombre completo de la persona/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: person.full_name })).toBeVisible();
});

test("editar alias no cambia el nombre ni permite desconectar la persona", async () => {
  const fetcher = setupUsers();
  await userEvent.click(
    screen.getByRole("button", { name: /Editar permisos/ }),
  );
  expect(screen.getByLabelText(/^Persona vinculada/)).toBeRequired();
  expect(
    screen.queryByRole("option", { name: "Registrar persona nueva" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Nombre de la persona/)).toHaveValue(
    person.full_name,
  );
  await userEvent.clear(screen.getByLabelText(/^Alias de la cuenta/));
  await userEvent.type(
    screen.getByLabelText(/^Alias de la cuenta/),
    "Turno de la tarde",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({
    person_id: person.id,
    display_name: "Turno de la tarde",
  });
  expect(body).not.toHaveProperty("full_name");
});

test("editar nombre en Personas actualiza la cuenta y conserva su alias", async () => {
  let name = person.full_name;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith(`/persons/${person.id}`) && options?.method === "PATCH") {
      name = JSON.parse(String(options.body)).full_name;
      return response({ ...person, full_name: name });
    }
    if (url.endsWith("/auth/me"))
      return response({ ...account, full_name: name });
    if (url.endsWith("/persons"))
      return response([{ ...person, full_name: name }]);
    if (url.endsWith("/users"))
      return response([{ ...account, full_name: name }]);
    return response([]);
  });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Personas" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: `Editar a ${person.full_name}` }),
  );
  await userEvent.clear(screen.getByLabelText("Nombre completo"));
  await userEvent.type(
    screen.getByLabelText("Nombre completo"),
    "Elena Vargas Corregida",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar cambios" }),
  );
  await screen.findByRole("status");
  await userEvent.click(
    screen.getByRole("button", { name: "Usuarios y permisos" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Elena Vargas Corregida" }),
  ).toBeVisible();
  expect(
    screen.getAllByText(`Alias de la cuenta: ${account.display_name}`),
  ).toHaveLength(2);
  expect(
    screen.queryByRole("heading", { name: person.full_name }),
  ).not.toBeInTheDocument();
});

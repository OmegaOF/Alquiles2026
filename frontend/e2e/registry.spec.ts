import { test, expect } from "@playwright/test";
import { authenticate, credentials, apiBase } from "./helpers";

test("iniciar sesión, cerrar sesión y rechazar credenciales incorrectas", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByLabel("Nombre de usuario", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Nombre de usuario", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Nombre de usuario", { exact: true })
    .fill(credentials().username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("clave-incorrecta-de-prueba");
  await page
    .getByRole("button", { name: "Ingresar al sistema", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(credentials().password);
  await page
    .getByRole("button", { name: "Ingresar al sistema", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("button", { name: "Ingresar al sistema", exact: true }),
  ).toBeVisible();
});

test("registrar y editar persona, propiedad y cuartos desde React", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const owner = `Propietaria de prueba ${suffix}`;
  const house = `Casa de prueba ${suffix}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Personas", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar persona", exact: true })
    .click();
  await page.getByLabel("Nombre completo", { exact: true }).fill(owner);
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: owner, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Propiedades", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar propiedad", exact: true })
    .click();
  await page.getByLabel("Nombre de la propiedad").fill(house);
  await page
    .getByLabel("Dirección", { exact: true })
    .fill("Calle de pruebas 101");
  await page.getByLabel("Ciudad", { exact: true }).fill("La Paz");
  await page
    .getByRole("combobox", { name: "Propietario 1", exact: true })
    .selectOption({ label: owner });
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: house }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar propiedad", exact: true })
    .click();
  await page.getByLabel("Zona (opcional)").fill("Zona de pruebas");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByText(/Calle de pruebas 101.*Zona de pruebas/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar cuarto", exact: true })
    .click();
  await page.getByLabel("Número o identificador", { exact: true }).fill("A-1");
  await page.getByLabel("Nombre del cuarto o unidad").fill("Cuarto con patio");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A-1 · Cuarto con patio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Editar cuarto A-1/ }).click();
  await page.getByLabel("En mantenimiento", { exact: true }).check();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByText(/En mantenimiento/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("propiedad-cuarto.png"),
    fullPage: true,
  });
});

test("el propietario solo ve sus casas y no acciones de administración", async ({
  page,
}) => {
  await authenticate(page);
  const tag = Date.now() + "-" + Math.random().toString(16).slice(2, 6);
  const person = await (
    await page.request.post(`${apiBase}/api/v1/persons`, {
      data: { full_name: `Propietario ${tag}`, is_owner: true },
    })
  ).json();
  const house = await (
    await page.request.post(`${apiBase}/api/v1/properties`, {
      data: {
        name: `Casa autorizada ${tag}`,
        address: "Dirección de prueba",
        city: "La Paz",
        owners: [{ person_id: person.id }],
      },
    })
  ).json();
  const username = "owner_" + tag;
  const response = await page.request.post(`${apiBase}/api/v1/users`, {
    data: {
      username,
      full_name: "Propietario con acceso",
      password: credentials().password,
      role: "owner",
      person_id: person.id,
    },
  });
  expect(response.ok()).toBe(true);
  await page.request.post(`${apiBase}/api/v1/auth/logout`);
  await page.request.post(`${apiBase}/api/v1/auth/login`, {
    data: { username, password: credentials().password },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Propiedades", exact: true }).click();
  await expect(page.getByRole("heading", { name: house.name })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar propiedad", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usuarios y permisos", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: new RegExp(`Ver propiedad ${house.name}`) })
    .click();
  await expect(
    page.getByRole("button", { name: "Editar propiedad", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Registrar cuarto", exact: true }),
  ).toHaveCount(0);
});

test("la sesión funciona también al entrar por localhost", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("Nombre de usuario", { exact: true })
    .fill(credentials().username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(credentials().password);
  await page
    .getByRole("button", { name: "Ingresar al sistema", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Propiedades", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Propiedades", exact: true }),
  ).toBeVisible();
});

test("administrar una cuenta y asignar permisos desde React", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const tag = Date.now() + "-" + Math.random().toString(16).slice(2, 6);
  const owner = await (
    await page.request.post(`${apiBase}/api/v1/persons`, {
      data: { full_name: "Titular de permisos " + tag, is_owner: true },
    })
  ).json();
  const assignedHouse = "Casa para operador " + tag;
  const propertyResponse = await page.request.post(
    `${apiBase}/api/v1/properties`,
    {
      data: {
        name: assignedHouse,
        address: "Calle de prueba",
        city: "La Paz",
        owners: [{ person_id: owner.id }],
      },
    },
  );
  expect(propertyResponse.ok()).toBe(true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Usuarios y permisos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar usuario", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Persona vinculada/ })
    .selectOption("new");
  await page
    .getByRole("textbox", { name: /Nombre completo de la persona/ })
    .fill("Operador de prueba " + tag);
  await page
    .getByRole("textbox", { name: /Nombre de usuario/ })
    .fill("operator_" + tag);
  await page
    .getByLabel("Contraseña", { exact: false })
    .fill(credentials().password);
  await page
    .getByRole("checkbox", { name: assignedHouse, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operador de prueba " + tag }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Editar permisos de Operador de prueba " + tag,
    })
    .click();
  await page.getByLabel("Cuenta habilitada", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  const row = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Operador de prueba " + tag }),
  });
  await expect(
    row.getByText("Cuenta deshabilitada", { exact: true }),
  ).toBeVisible();
});

test("el nombre de una persona se actualiza en sus cuentas sin cambiar sus alias", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const tag = Date.now() + "-" + Math.random().toString(16).slice(2, 6);
  const original = "Persona compartida " + tag;
  const corrected = "Persona corregida " + tag;
  const identity = await (
    await page.request.post(`${apiBase}/api/v1/persons`, {
      data: { full_name: original },
    })
  ).json();
  for (const suffix of ["a", "b"]) {
    const result = await page.request.post(`${apiBase}/api/v1/users`, {
      data: {
        username: `identity_${suffix}_${tag}`,
        person_id: identity.id,
        display_name: "Alias " + suffix,
        password: credentials().password,
        role: "operator",
      },
    });
    expect(result.ok()).toBe(true);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Personas", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar a " + original, exact: true })
    .click();
  await page.getByLabel("Nombre completo", { exact: true }).fill(corrected);
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: corrected, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Usuarios y permisos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: corrected, exact: true }),
  ).toHaveCount(2);
  const accounts = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: corrected, exact: true }),
    });
  await expect(
    accounts.getByText("Alias de la cuenta: Alias a", { exact: true }),
  ).toBeVisible();
  await expect(
    accounts.getByText("Alias de la cuenta: Alias b", { exact: true }),
  ).toBeVisible();
});

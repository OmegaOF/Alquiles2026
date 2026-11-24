import { AxeBuilder } from "@axe-core/playwright";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase, openSection, selectRecord } from "./helpers";

test.setTimeout(90000);
test.use({ timezoneId: "America/La_Paz", locale: "es-BO" });
async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(`${apiBase}/api/v1${path}`, {
    data,
  });
  expect(response.status(), `POST ${path}: ${await response.text()}`).toBe(201);
  return response.json();
}
async function houseFixture(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const owner = await post(page, "/persons", {
    full_name: `Titular prueba ${suffix}`,
    is_owner: true,
  });
  const house = await post(page, "/properties", {
    name: `Casa contratos ${suffix}`,
    address: "Calle de pruebas 202",
    city: "La Paz",
    owners: [{ person_id: owner.id, share: 100 }],
  });
  const first = await post(page, `/properties/${house.id}/units`, {
    code: "A",
    name: "Cuarto con patio",
    unit_type: "cuarto",
  });
  const second = await post(page, `/properties/${house.id}/units`, {
    code: "B",
    name: "Cuarto con ventana",
    unit_type: "cuarto",
  });
  const tenant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Responsable prueba ${suffix}`,
  });
  const occupant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Ocupante prueba ${suffix}`,
  });
  return { house, first, second, owner, tenant, occupant };
}
async function next(page: Page) {
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
}
async function finishWizard(page: Page, button = "Guardar contrato") {
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Revisar el resumen" }),
  ).toBeVisible();
  await page.getByLabel("He revisado los datos y confirmo el contrato").check();
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(
    page.getByText(/El contrato se guardó correctamente/),
  ).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.CAPTURE_PHASE2_SCREENSHOTS !== "1") return;
  mkdirSync("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: `../docs/screenshots/phase-2-${info.project.name}-${name}.png`,
    fullPage: true,
  });
}
function dailyBody(
  f: Awaited<ReturnType<typeof houseFixture>>,
  start: string,
  end: string,
) {
  return {
    property_id: null,
    unit_id: f.first.id,
    responsible_person_id: f.tenant.id,
    occupant_ids: [f.occupant.id],
    owner_parties: [{ person_id: f.owner.id, share: 100 }],
    mode: "daily",
    status: "active",
    start_date: start,
    end_date: end,
    price: "70.00",
    currency: "BOB",
    services_included: true,
  };
}

test("contrato diario guiado, modificación, prórroga y disponibilidad por cuarto", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  await page.goto("/");
  await openSection(page, "Alquileres", "Contratos");
  await page
    .getByRole("button", { name: "Registrar contrato", exact: true })
    .click();
  await selectRecord(page.getByLabel("Casa del contrato"), String(f.house.id));
  await selectRecord(page.getByLabel("Espacio a alquilar"), String(f.first.id));
  await selectRecord(page.getByLabel("Modalidad de alquiler"), "daily");
  await page.getByLabel("Fecha de entrada", { exact: true }).fill("2031-01-01");
  await page.getByLabel("Fecha de salida", { exact: true }).fill("2031-01-03");
  await next(page);
  await selectRecord(
    page.getByLabel("Persona responsable del contrato"),
    String(f.tenant.id),
  );
  await page
    .getByRole("group", { name: "Ocupantes adicionales (opcional)" })
    .getByLabel(f.occupant.full_name, { exact: true })
    .check();
  await next(page);
  await page.getByLabel("Precio por día o noche acordado").fill("75.50");
  await expect(page.getByLabel("Servicios básicos incluidos")).toBeChecked();
  await expect(page.getByLabel("Servicios básicos incluidos")).toBeDisabled();
  await selectRecord(page.getByLabel("Estado al guardar"), "active");
  await next(page);
  await capture(page, info, "resumen");
  await page.getByLabel("He revisado los datos y confirmo el contrato").check();
  await page
    .getByRole("button", { name: "Guardar contrato", exact: true })
    .click();
  await expect(
    page.getByText(/3 días cobrables; ocupación de 3 días/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Modificar contrato", exact: true })
    .click();
  for (let step = 1; step < 3; step++) await next(page);
  await page
    .getByText("Condiciones adicionales y observaciones", { exact: true })
    .click();
  await page
    .getByLabel("Observaciones (opcional)", { exact: true })
    .fill("Condiciones revisadas con las personas contratantes");
  await finishWizard(page);
  await page
    .getByRole("button", { name: "Prorrogar contrato", exact: true })
    .click();
  await page.getByLabel("Nueva fecha de salida").fill("2031-01-20");
  await page
    .getByLabel("Motivo del cambio")
    .fill("Ampliación acordada de la estancia");
  await page
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(
    page.getByText(/20 días cobrables; ocupación de 20 días/),
  ).toBeVisible();
  await expect(
    page.getByText(/Todos los servicios básicos incluidos, incluso/),
  ).toBeVisible();
  await expect(
    page.getByText("Motivo: Ampliación acordada de la estancia"),
  ).toBeVisible();
  await capture(page, info, "contrato");
  await openSection(page, "Casas y cuartos", "Disponibilidad");
  await selectRecord(
    page.getByLabel("Propiedad a consultar"),
    String(f.house.id),
  );
  await page.getByLabel("Consultar desde").fill("2031-01-01");
  await page.getByLabel("Consultar hasta").fill("2031-01-20");
  await page
    .getByRole("button", { name: "Consultar disponibilidad", exact: true })
    .click();
  await expect(page.getByText("1 disponible", { exact: true })).toBeVisible();
  const whole = page.locator(".whole-availability");
  await expect(whole.getByText("No disponible", { exact: true })).toBeVisible();
  const free = page.getByRole("row").filter({ hasText: "Cuarto con ventana" });
  await expect(free.getByText("Disponible", { exact: true })).toBeVisible();
  await capture(page, info, "disponibilidad");
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((el) => el.clientWidth),
  );
});

test("reserva desde React, persona sin cuenta, confirmación y conversión en contrato", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  await page.goto("/");
  await openSection(page, "Alquileres", "Reservas");
  await page.getByRole("searchbox", { name: "Buscar reservas" }).fill(f.house.name);
  await page
    .getByRole("button", { name: "Registrar reserva", exact: true })
    .click();
  await selectRecord(page.getByLabel("Casa de la reserva"), String(f.house.id));
  await selectRecord(page.getByLabel("Espacio reservado"), String(f.first.id));
  await page
    .getByRole("button", { name: "Registrar nueva persona", exact: true })
    .click();
  const name = `Persona reserva ${f.house.id}`;
  await page.getByLabel("Nombre completo de la nueva persona").fill(name);
  await page
    .getByRole("button", { name: "Guardar persona", exact: true })
    .click();
  await expect(page.getByLabel("Persona que reserva")).not.toHaveValue("");
  await page.getByLabel("Entrada de la reserva").fill("2031-02-01");
  await page.getByLabel("Salida de la reserva").fill("2031-02-03");
  await page
    .getByLabel("Vencimiento de la reserva (opcional)")
    .fill("2031-01-31T12:15");
  await page
    .getByRole("button", { name: "Guardar reserva", exact: true })
    .click();
  const row = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`Reserva \\d+ · ${f.house.name}`),
    }),
  });
  await expect(row.getByText("Pendiente", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /^Modificar reserva/ }).click();
  await expect(
    page.getByLabel("Vencimiento de la reserva (opcional)"),
  ).toHaveValue("2031-01-31T12:15");
  await page
    .getByRole("button", { name: "Guardar reserva", exact: true })
    .click();
  await expect(row.getByText("Pendiente", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /^Confirmar reserva/ }).click();
  await expect(row.getByText("Confirmada", { exact: true })).toBeVisible();
  await capture(page, info, "reservas");
  await row.getByRole("button", { name: /^Convertir reserva/ }).click();
  for (let step = 1; step < 3; step++) await next(page);
  await expect(page.getByLabel("Estado al guardar")).toHaveValue("active");
  await page.getByLabel("Precio por día o noche acordado").fill("80");
  await finishWizard(page, "Crear contrato desde la reserva");
  await expect(
    page.getByText(`Responsable: ${name}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "← Volver a reservas", exact: true })
    .click();
  await expect(
    row.getByText("Convertida en contrato", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: /^Convertir reserva/ }),
  ).toHaveCount(0);
  const response = await page.request.get(
    `${apiBase}/api/v1/contracts?property_id=${f.house.id}`,
  );
  expect((await response.json()).length).toBe(1);
});

test("finalización anticipada conserva personas e historial y actualiza la vista de la casa", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(Date.parse(today + "T00:00:00Z") - 5 * 86400000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(Date.parse(today + "T00:00:00Z") + 10 * 86400000)
    .toISOString()
    .slice(0, 10);
  const contract = await post(page, "/contracts", dailyBody(f, start, end));
  await page.goto("/");
  await openSection(page, "Casas y cuartos", "Mis casas");
  await page
    .getByRole("searchbox", { name: "Buscar casas" })
    .fill(f.house.name);
  await page
    .getByRole("button", { name: `Ver propiedad ${f.house.name}`, exact: true })
    .click();
  await expect(
    page
      .locator(".whole-availability")
      .getByText("No disponible", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 disponible", { exact: true })).toBeVisible();
  await openSection(page, "Alquileres", "Contratos");
  await page
    .getByRole("searchbox", { name: "Buscar contratos" })
    .fill(f.house.name);
  await page
    .getByRole("button", { name: `Ver contrato ${contract.id}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Modificar contrato", exact: true })
    .click();
  await expect(page.getByLabel("Espacio a alquilar")).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancelar registro", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finalizar contrato", exact: true })
    .click();
  await page.getByLabel("Fecha real de finalización").fill(today);
  await page
    .getByLabel("Motivo del cambio")
    .fill("Salida anticipada registrada con la persona responsable");
  await page
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await expect(page.getByText(/Finalización real:/)).toBeVisible();
  await expect(
    page.getByText(
      /Plazo pactado para el precio: 16 días. Ocupación registrada: 6 días/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Modificar contrato", exact: true }),
  ).toHaveCount(0);
  await openSection(page, "Alquileres", "Inquilinos");
  await selectRecord(
    page.getByLabel("Propiedad del historial"),
    String(f.house.id),
  );
  await expect(
    page.getByRole("heading", {
      name: `Contrato ${contract.id} · Finalizado`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`Ocupantes adicionales: ${f.occupant.full_name}`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("Ver cambios y ocupantes anteriores", { exact: true })
    .click();
  await expect(
    page.getByText(
      "Motivo: Salida anticipada registrada con la persona responsable",
    ),
  ).toBeVisible();
  await capture(page, info, "historial");
});

test("crea un inquilino dentro del asistente y recupera el contrato guardado como borrador", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  await page.goto("/");
  await openSection(page, "Alquileres", "Contratos");
  await page
    .getByRole("button", { name: "Registrar contrato", exact: true })
    .click();
  await selectRecord(page.getByLabel("Casa del contrato"), String(f.house.id));
  await selectRecord(page.getByLabel("Espacio a alquilar"), String(f.first.id));
  await page.getByLabel("Fecha de entrada", { exact: true }).fill("2033-05-01");
  await page.getByLabel("Fecha de salida", { exact: true }).fill("2033-05-03");
  await next(page);
  await page
    .getByRole("button", { name: "+ Registrar inquilino", exact: true })
    .click();
  const name = `Inquilino nuevo ${f.house.id}`;
  await page.getByLabel("Nombre completo de la nueva persona").fill(name);
  await page
    .getByRole("button", { name: "Guardar persona", exact: true })
    .click();
  await expect(page.getByLabel("Persona responsable del contrato")).toHaveValue(
    name,
  );
  await next(page);
  await page.getByLabel("Precio por día o noche acordado").fill("120");
  await finishWizard(page);
  const saved = await page.request.get(
    `${apiBase}/api/v1/contracts?property_id=${f.house.id}`,
  );
  expect(saved.ok()).toBe(true);
  const rows = await saved.json();
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: "draft",
        mode: "daily",
        start_date: "2033-05-01",
        end_date: "2033-05-03",
        unit_id: f.first.id,
      }),
    ]),
  );
  await page.reload();
  await openSection(page, "Alquileres", "Contratos");
  const draft = page
    .locator("article")
    .filter({ hasText: f.house.name })
    .filter({ hasText: name });
  await expect(draft).toContainText("Borrador");
});

test("registra un cuarto desde una reserva y conserva las fechas introducidas", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  await page.goto("/");
  await openSection(page, "Alquileres", "Reservas");
  await page
    .getByRole("button", { name: "Registrar reserva", exact: true })
    .click();
  await selectRecord(page.getByLabel("Casa de la reserva"), String(f.house.id));
  await page.getByLabel("Entrada de la reserva").fill("2033-07-01");
  await page.getByLabel("Salida de la reserva").fill("2033-07-03");
  await page
    .getByRole("button", { name: "+ Registrar cuarto", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar cuarto para la reserva",
  });
  await dialog
    .getByLabel("Número o identificador", { exact: true })
    .fill("UX-R");
  await dialog
    .getByLabel("Nombre del cuarto o unidad")
    .fill("Cuarto desde reserva");
  await dialog
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Espacio reservado" }),
  ).toHaveValue(/UX-R · Cuarto desde reserva/);
  await expect(page.getByLabel("Entrada de la reserva")).toHaveValue(
    "2033-07-01",
  );
  await expect(page.getByLabel("Salida de la reserva")).toHaveValue(
    "2033-07-03",
  );
  await selectRecord(
    page.getByRole("combobox", { name: "Persona que reserva" }),
    String(f.tenant.id),
  );
  await page
    .getByRole("button", { name: "Guardar reserva", exact: true })
    .click();
  await expect(
    page.getByText(/La reserva se guardó correctamente/),
  ).toBeVisible();
});

test("consulta e inventario paginan y enlazan los formularios y los impedimentos correctos", async ({
  page,
}) => {
  await authenticate(page);
  page.on("dialog", (dialog) => dialog.accept());
  const f = await houseFixture(page);
  const path = `/properties/${f.house.id}`;
  for (let i = 1; i <= 21; i++) {
    await post(page, `${path}/units`, {
      code: `C-${String(i).padStart(2, "0")}`,
      name: i === 21 ? "Último local" : `Cuarto interior ${i}`,
      unit_type: i === 21 ? "local" : "cuarto",
      maintenance: i === 21,
      is_enabled: i !== 20,
      notes: i === 21 ? "Detalle de la reparación programada" : null,
    });
  }
  const contract = await post(
    page,
    "/contracts",
    dailyBody(f, "2033-01-01", "2033-01-03"),
  );
  const reserve = (unit_id: number, start_date: string, end_date: string) =>
    post(page, "/reservations", {
      unit_id,
      start_date,
      end_date,
      mode: "daily",
      status: "pending",
      person_id: f.tenant.id,
    });
  const other = await reserve(f.first.id, "2033-01-04", "2033-01-05");
  const reserved = await reserve(f.second.id, "2033-01-01", "2033-01-05");

  await page.goto("/");
  await openSection(page, "Casas y cuartos", "Disponibilidad");
  await selectRecord(page.getByLabel("Propiedad a consultar"), {
    label: f.house.name,
  });
  await page.getByLabel("Consultar desde").fill("2033-01-03");
  await page.getByLabel("Consultar hasta").fill("2033-01-04");
  await page.getByRole("button", { name: "Consultar disponibilidad" }).click();
  await expect(
    page.getByRole("heading", { name: /03\/01\/2033 al 04\/01\/2033/ }),
  ).toBeVisible();
  const table = page.getByRole("table", {
    name: "Disponibilidad de cuartos y unidades",
  });
  await expect(table.getByRole("row")).toHaveCount(21);
  await expect(page.getByText("23 resultados · 1–20")).toBeVisible();
  const first = table.getByRole("row").filter({ hasText: "Cuarto con patio" });
  await expect(first.getByText("Ocupado", { exact: true })).toBeVisible();
  await expect(first.getByText("01/01/2033 al 03/01/2033")).toBeVisible();
  await first.getByText("Otros impedimentos (1)").click();
  await first
    .getByRole("button", { name: `Ver reserva ${other.id}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Reserva ${other.id} · ${f.house.name}`,
    }),
  ).toBeVisible();
  const back = page.getByRole("button", { name: "Volver a disponibilidad" });
  await back.click();
  await first
    .getByRole("button", { name: `Ver contrato ${contract.id}` })
    .click();
  await expect(page.getByText(`CONTRATO N.º ${contract.id}`)).toBeVisible();
  await back.click();
  await expect(
    table.getByRole("button", { name: `Ver reserva ${reserved.id}` }),
  ).toBeVisible();

  const nextPage = page
    .getByRole("navigation", { name: "Paginación de disponibilidad" })
    .getByRole("button", { name: "Siguiente" });
  await nextPage.focus();
  await page.keyboard.press("Enter");
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(page.getByText("23 resultados · 21–23")).toBeVisible();
  const search = page.getByRole("searchbox", {
    name: "Buscar en disponibilidad",
  });
  await search.fill("ultimo local");
  await page.getByLabel("Estado de disponibilidad").selectOption("maintenance");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
  await table
    .getByRole("button", { name: "Ver detalle del cuarto C-21" })
    .click();
  await expect(
    page.getByText("Detalle de la reparación programada"),
  ).toBeVisible();
  await back.click();
  await expect(search).toHaveValue("ultimo local");
  await expect(page.getByLabel("Estado de disponibilidad")).toHaveValue(
    "maintenance",
  );
  await expect(page.getByLabel("Consultar desde")).toHaveValue("2033-01-03");

  await page.getByLabel("Estado de disponibilidad").selectOption("available");
  await expect(
    page.getByText("No se encontraron cuartos para la consulta."),
  ).toBeVisible();
  await search.fill("C-19");
  await table.getByRole("button", { name: "Crear contrato C-19" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar contrato" }),
  ).toBeVisible();
  await expect(page.getByLabel("Casa del contrato")).toHaveValue(
    new RegExp(f.house.name),
  );
  await expect(page.getByLabel("Espacio a alquilar")).toHaveValue(/C-19/);
  await expect(
    page.getByLabel("Fecha de entrada", { exact: true }),
  ).toHaveValue("2033-01-03");
  await expect(page.getByLabel("Fecha de salida", { exact: true })).toHaveValue(
    "2033-01-04",
  );
  await back.click();

  await table.getByRole("button", { name: "Reservar cuarto C-19" }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar reserva" }),
  ).toBeVisible();
  await expect(page.getByLabel("Casa de la reserva")).toHaveValue(
    new RegExp(f.house.name),
  );
  await expect(page.getByLabel("Espacio reservado")).toHaveValue(/C-19/);
  await expect(page.getByLabel("Entrada de la reserva")).toHaveValue(
    "2033-01-03",
  );
  await expect(page.getByLabel("Salida de la reserva")).toHaveValue(
    "2033-01-04",
  );
  await selectRecord(page.getByLabel("Persona que reserva"), {
    label: f.tenant.full_name,
  });
  const units = await (
    await page.request.get(`${apiBase}/api/v1${path}/units`)
  ).json();
  const lateBlocker = await reserve(
    units.find((unit: { code: string }) => unit.code === "C-19").id,
    "2033-01-04",
    "2033-01-04",
  );
  await page.getByRole("button", { name: "Guardar reserva" }).click();
  await expect(page.getByRole("alert")).toContainText(
    `Reserva ${lateBlocker.id}`,
  );

  await back.click();
  await openSection(page, "Casas y cuartos", "Cuartos");
  await selectRecord(page.getByLabel("Casa de los cuartos"), {
    label: f.house.name,
  });
  const inventory = page.getByRole("table", {
    name: "Inventario de cuartos y unidades",
  });
  await expect(inventory.getByRole("row")).toHaveCount(21);
  await page.getByLabel("Tipo de unidad").selectOption("local");
  await page.getByLabel("Habilitación").selectOption("true");
  await page.getByLabel("Mantenimiento").selectOption("true");
  const local = inventory.getByRole("row").filter({ hasText: "C-21" });
  await expect(local.getByText("Habilitado", { exact: true })).toBeVisible();
  await expect(
    local.getByText("En mantenimiento", { exact: true }),
  ).toBeVisible();
  await expect(local.getByText("Sin ocupación", { exact: true })).toBeVisible();
  await expect(
    inventory.getByText("Detalle de la reparación programada"),
  ).toHaveCount(0);
  const region = page.getByRole("region", {
    name: "Inventario de cuartos y unidades",
  });
  await region.focus();
  await expect(region).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page })
      .include(".compact-table")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  }

  await openSection(page, "Casas y cuartos", "Disponibilidad");
  await selectRecord(page.getByLabel("Propiedad a consultar"), {
    label: f.house.name,
  });
  await page.getByLabel("Consultar desde").fill("2033-01-03");
  await page.getByLabel("Consultar hasta").fill("2033-01-04");
  await page.getByRole("button", { name: "Consultar disponibilidad" }).click();
  await expect(page.getByText("1 ocupado", { exact: true })).toBeVisible();
  const labels = [
    "disponibles",
    "ocupado",
    "reservados",
    "en mantenimiento",
    "deshabilitado",
  ];
  const light = [
    "rgb(21, 86, 48)",
    "rgb(138, 24, 37)",
    "rgb(105, 72, 0)",
    "rgb(88, 43, 128)",
    "rgb(67, 73, 82)",
  ];
  const dark = [
    "rgb(168, 242, 194)",
    "rgb(255, 210, 215)",
    "rgb(255, 229, 161)",
    "rgb(234, 212, 255)",
    "rgb(236, 238, 241)",
  ];
  const summary = page.getByRole("list", {
    name: "Resumen de cuartos por estado",
  });
  for (const [scheme, colors] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [index, label] of labels.entries()) {
      const status = summary
        .locator(".property-status")
        .filter({ hasText: new RegExp(`\\d+ ${label}$`) });
      await expect(status).toHaveCSS("color", colors[index]);
      await expect(status.locator('[aria-hidden="true"]')).toBeVisible();
    }
  }
});

test("un propietario consulta la disponibilidad sin accesos de escritura", async ({
  page,
}) => {
  await authenticate(page);
  const f = await houseFixture(page);
  const contract = await post(
    page,
    "/contracts",
    dailyBody(f, "2033-01-01", "2033-01-03"),
  );
  const login = {
    username: `ux_owner_${Date.now()}`,
    password: crypto.randomUUID(),
  };
  await post(page, "/users", {
    ...login,
    person_id: f.owner.id,
    role: "owner",
  });
  const response = await page.request.post(`${apiBase}/api/v1/auth/login`, {
    data: login,
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await openSection(page, "Casas y cuartos", "Disponibilidad");
  await page.getByLabel("Consultar desde").fill("2033-01-02");
  await page.getByLabel("Consultar hasta").fill("2033-01-02");
  await page.getByRole("button", { name: "Consultar disponibilidad" }).click();
  const table = page.getByRole("table", {
    name: "Disponibilidad de cuartos y unidades",
  });
  await expect(table.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(
    table.getByRole("button", { name: /Reservar cuarto|Crear contrato/ }),
  ).toHaveCount(0);
  await table
    .getByRole("button", { name: `Ver contrato ${contract.id}` })
    .click();
  await expect(page.getByText(`CONTRATO N.º ${contract.id}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Modificar contrato" }),
  ).toHaveCount(0);
});

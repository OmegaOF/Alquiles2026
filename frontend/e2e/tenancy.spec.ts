import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase } from "./helpers";

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
  await next(page);
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
  await page.getByRole("button", { name: "Contratos", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar contrato", exact: true })
    .click();
  await page.getByLabel("Casa del contrato").selectOption(String(f.house.id));
  await next(page);
  await page.getByLabel("Espacio a alquilar").selectOption(String(f.first.id));
  await next(page);
  await page.getByLabel("Modalidad de alquiler").selectOption("daily");
  await next(page);
  await page
    .getByLabel("Persona responsable del contrato")
    .selectOption(String(f.tenant.id));
  await page
    .getByRole("group", { name: "Ocupantes adicionales (opcional)" })
    .getByLabel(f.occupant.full_name, { exact: true })
    .check();
  await next(page);
  await page.getByLabel("Fecha de entrada", { exact: true }).fill("2031-01-01");
  await page.getByLabel("Fecha de salida", { exact: true }).fill("2031-01-03");
  await next(page);
  await page.getByLabel("Precio por día o noche acordado").fill("75.50");
  await expect(page.getByLabel("Servicios básicos incluidos")).toBeChecked();
  await expect(page.getByLabel("Servicios básicos incluidos")).toBeDisabled();
  await page.getByLabel("Estado al guardar").selectOption("active");
  await next(page);
  await capture(page, info, "resumen");
  await next(page);
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
  for (let step = 1; step < 6; step++) await next(page);
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
  await page
    .getByRole("button", { name: "Disponibilidad", exact: true })
    .click();
  await page
    .getByLabel("Propiedad a consultar")
    .selectOption(String(f.house.id));
  await page.getByLabel("Consultar desde").fill("2031-01-01");
  await page.getByLabel("Consultar hasta").fill("2031-01-20");
  await page
    .getByRole("button", { name: "Consultar disponibilidad", exact: true })
    .click();
  await expect(page.getByText("Cuartos disponibles: 1 de 2.")).toBeVisible();
  const whole = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Casa completa", exact: true }),
  });
  await expect(whole.getByText("Ocupado", { exact: true })).toBeVisible();
  const free = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "B · Cuarto con ventana",
      exact: true,
    }),
  });
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
  await page.getByRole("button", { name: "Reservas", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar reserva", exact: true })
    .click();
  await page.getByLabel("Casa de la reserva").selectOption(String(f.house.id));
  await page.getByLabel("Espacio reservado").selectOption(String(f.first.id));
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
  for (let step = 1; step < 6; step++) await next(page);
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
  await page.getByRole("button", { name: "Propiedades", exact: true }).click();
  await page
    .getByRole("button", { name: `Ver propiedad ${f.house.name}`, exact: true })
    .click();
  await expect(page.getByText(/Casa completa: Ocupado/)).toBeVisible();
  await expect(page.getByText("Cuartos disponibles: 1 de 2.")).toBeVisible();
  await page.getByRole("button", { name: "Contratos", exact: true }).click();
  await page
    .getByRole("button", { name: `Ver contrato ${contract.id}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Modificar contrato", exact: true })
    .click();
  await next(page);
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
  await page
    .getByRole("button", { name: "Ocupantes e historial", exact: true })
    .click();
  await page
    .getByLabel("Propiedad del historial")
    .selectOption(String(f.house.id));
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

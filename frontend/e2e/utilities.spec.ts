import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase } from "./helpers";

test.setTimeout(90000);
test.use({ locale: "es-BO", timezoneId: "America/La_Paz" });
async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(`${apiBase}/api/v1${path}`, {
    data,
  });
  expect(response.status(), `POST ${path}: ${await response.text()}`).toBe(201);
  return response.json();
}
async function setup(page: Page, createService = true, method = "equal") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 5)}`;
  const owner = await post(page, "/persons", {
    full_name: `Propietaria servicios ${suffix}`,
    is_owner: true,
  });
  const house = await post(page, "/properties", {
    name: `Casa servicios ${suffix}`,
    address: "Calle de prueba 303",
    city: "La Paz",
    owners: [{ person_id: owner.id, share: 100 }],
  });
  const a = await post(page, `/properties/${house.id}/units`, {
    code: "A",
    name: "Cuarto con patio",
    unit_type: "cuarto",
  });
  const b = await post(page, `/properties/${house.id}/units`, {
    code: "B",
    name: "Cuarto con ventana",
    unit_type: "cuarto",
  });
  const one = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Ocupante uno ${suffix}`,
  });
  const two = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Ocupante dos ${suffix}`,
  });
  const types = await (
    await page.request.get(`${apiBase}/api/v1/utility-types`)
  ).json();
  const type =
    types.find((t: { name: string }) => t.name === "Electricidad") ||
    (await post(page, "/utility-types", { name: "Electricidad" }));
  const account = createService
    ? await post(page, `/properties/${house.id}/service-accounts`, {
        type_id: type.id,
        label: `Electricidad ${house.id}`,
        provider: "Empresa de prueba",
        account_number: `TEST-${house.id}`,
        measurement_kind: "shared",
        measure_unit: "kWh",
        start_date: "2020-01-01",
        configuration: {
          method,
          unit_ids: [a.id, b.id],
          owner_person_id: owner.id,
          provider_payer_id: owner.id,
          reimbursement_person_id: owner.id,
        },
      })
    : null;
  return { owner, house, a, b, one, two, account };
}
async function enter(page: Page, house: number) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Servicios básicos", exact: true })
    .click();
  await page
    .getByLabel("Casa de los servicios básicos")
    .selectOption(String(house));
}
async function rent(
  page: Page,
  f: Awaited<ReturnType<typeof setup>>,
  unit: number,
  person: number,
  start: string,
  end: string,
) {
  return post(page, "/contracts", {
    property_id: null,
    unit_id: unit,
    responsible_person_id: person,
    owner_parties: [{ person_id: f.owner.id, share: 100 }],
    mode: "monthly",
    status: "active",
    start_date: start,
    end_date: end,
    price: "1000",
    currency: "BOB",
    monthly_period: "calendar",
    first_period: "full",
    due_day: 5,
    services_included: false,
  });
}
function receiptBody(reference: string) {
  return {
    external_reference: reference,
    amount: "300",
    currency: "BOB",
    issued_on: "2031-01-31",
    period_start: "2031-01-01",
    period_end: "2031-01-30",
    due_on: "2031-02-10",
  };
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.CAPTURE_PHASE3_SCREENSHOTS !== "1") return;
  mkdirSync("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: `../docs/screenshots/phase-3-${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

test("servicio, recibo externo, ejemplo 14/15 días y corrección con historial", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (d) => d.accept());
  const f = await setup(page, false);
  await rent(page, f, f.a.id, f.one.id, "2031-01-01", "2031-01-14");
  await rent(page, f, f.b.id, f.two.id, "2031-01-01", "2031-01-15");
  await enter(page, f.house.id);
  await page
    .getByRole("button", { name: "Registrar servicio", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tipo de servicio", exact: true })
    .selectOption({ label: "Electricidad" });
  const label = `Electricidad de casa ${f.house.id}`;
  await page.getByLabel("Nombre para reconocer el suministro").fill(label);
  await page
    .getByLabel("Empresa proveedora", { exact: true })
    .fill("Empresa de prueba");
  await page
    .getByLabel("Número de cuenta o suministro (opcional)")
    .fill(`TEST-${f.house.id}`);
  await page
    .getByLabel("Unidad de medida (opcional, por ejemplo kWh o m³)")
    .fill("kWh");
  await page.getByLabel("Fecha de inicio del servicio").fill("2020-01-01");
  await page
    .getByRole("group", {
      name: "Cuartos incluidos en el servicio",
      exact: true,
    })
    .getByLabel("A · Cuarto con patio", { exact: true })
    .check();
  await page
    .getByRole("group", {
      name: "Cuartos incluidos en el servicio",
      exact: true,
    })
    .getByLabel("B · Cuarto con ventana", { exact: true })
    .check();
  await page
    .getByLabel("Persona que asume la parte del propietario")
    .selectOption(String(f.owner.id));
  await page
    .getByLabel("Persona prevista para pagar al proveedor (opcional)")
    .selectOption(String(f.owner.id));
  await page
    .getByLabel("Persona prevista para recibir reintegros (opcional)")
    .selectOption(String(f.owner.id));
  await page
    .getByRole("button", { name: "Guardar servicio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  await capture(page, info, "servicios");
  await page
    .getByRole("button", { name: "Recibos y distribución", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar recibo", exact: true })
    .click();
  await page
    .getByLabel("Referencia externa del recibo (opcional)")
    .fill(`EXT-${f.house.id}`);
  await page.getByLabel("Importe total del recibo").fill("300");
  await page
    .getByLabel("Fecha de emisión del recibo externo")
    .fill("2031-01-31");
  await page.getByLabel("Inicio del periodo de consumo").fill("2031-01-01");
  await page.getByLabel("Fin del periodo de consumo").fill("2031-01-30");
  await page.getByLabel("Fecha límite de pago al proveedor").fill("2031-02-10");
  await page
    .getByRole("button", { name: "Guardar recibo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calcular reparto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Resumen del reparto/ }),
  ).toBeVisible();
  const first = page
    .locator(".utility-space")
    .filter({
      has: page.getByRole("heading", {
        name: "A · Cuarto con patio: Bs 150,00",
        exact: true,
      }),
    });
  await expect(first).toContainText("Bs 70,00");
  await expect(first).toContainText("Bs 80,00");
  const second = page
    .locator(".utility-space")
    .filter({
      has: page.getByRole("heading", {
        name: "B · Cuarto con ventana: Bs 150,00",
        exact: true,
      }),
    });
  await expect(second).toContainText(f.two.full_name);
  await capture(page, info, "reparto");
  await page
    .getByRole("button", { name: "Confirmar distribución", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Distribución confirmada",
  );
  await page
    .getByRole("button", { name: "Corregir recibo registrado", exact: true })
    .click();
  await page.getByLabel("Importe total del recibo").fill("330");
  await page
    .getByLabel("Motivo de la corrección del recibo")
    .fill("Corrección del importe registrado del proveedor");
  await page
    .getByRole("button", { name: "Guardar corrección del recibo", exact: true })
    .click();
  await page
    .getByLabel("Motivo del cálculo o corrección")
    .fill("Reparto ajustado al importe externo corregido");
  await page
    .getByRole("button", { name: "Calcular reparto", exact: true })
    .click();
  await expect(page.locator(".utility-total")).toContainText("Bs 330,00");
  await page
    .getByRole("button", { name: "Confirmar distribución", exact: true })
    .click();
  await expect(page.getByText(/Revisión 1: Bs 300,00/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Sustituido · conservado en historial/ }),
  ).toBeVisible();
  await capture(page, info, "historial");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: /Emitir|Generar documento|Registrar pago|Marcar.*pagado/i,
    }),
  ).toHaveCount(0);
});

test("lecturas válidas e inválidas, reemplazo y consumo de dos medidores", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (d) => d.accept());
  const f = await setup(page, true, "readings");
  const b = await post(page, `/service-accounts/${f.account.id}/meters`, {
    unit_id: f.b.id,
    serial: `B-${f.house.id}`,
    installed_on: "2031-01-01",
    initial_value: "0",
  });
  await post(page, `/utility-meters/${b.id}/readings`, {
    recorded_on: "2031-01-30",
    value: "140",
  });
  await enter(page, f.house.id);
  await page
    .getByRole("button", { name: "Medidores y lecturas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar medidor", exact: true })
    .click();
  await page
    .getByLabel("Identificación del medidor nuevo")
    .fill(`A-${f.house.id}`);
  await page.getByLabel("Espacio medido").selectOption(String(f.a.id));
  await page.getByLabel("Fecha de instalación").fill("2031-01-01");
  await page.getByLabel("Lectura inicial (opcional)").fill("100");
  await page
    .getByRole("button", { name: "Guardar medidor", exact: true })
    .click();
  await page.getByLabel("Fecha de la lectura").fill("2031-01-15");
  await page.getByLabel("Valor de la lectura").fill("90");
  await page
    .getByRole("button", { name: "Guardar lectura", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("compatible");
  await page.getByLabel("Valor de la lectura").fill("150");
  await page
    .getByRole("button", { name: "Guardar lectura", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Lectura guardada");
  await page
    .getByRole("button", { name: "Reemplazar este medidor", exact: true })
    .click();
  await page
    .getByLabel("Identificación del medidor nuevo")
    .fill(`NUEVO-${f.house.id}`);
  await page.getByLabel("Fecha del reemplazo").fill("2031-01-15");
  await page.getByLabel("Lectura inicial (opcional)").fill("0");
  await page
    .getByRole("button", { name: "Guardar medidor", exact: true })
    .click();
  await page.getByLabel("Fecha de la lectura").fill("2031-01-30");
  await page.getByLabel("Valor de la lectura").fill("90");
  await page
    .getByRole("button", { name: "Guardar lectura", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Lectura guardada");
  await capture(page, info, "lecturas");
  await page
    .getByRole("button", { name: "← Volver a medidores", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`Medidor A-${f.house.id}`) }),
  ).toBeVisible();
  await capture(page, info, "medidores");
  const r = await post(page, `/service-accounts/${f.account.id}/receipts`, {
    ...receiptBody(`MED-${f.house.id}`),
    consumption: "280",
  });
  await page
    .getByRole("button", { name: "Recibos y distribución", exact: true })
    .click();
  // Se vuelve a cargar el módulo para consultar el recibo externo recién registrado.
  await page.reload();
  await page
    .getByRole("button", { name: "Servicios básicos", exact: true })
    .click();
  await page
    .getByLabel("Casa de los servicios básicos")
    .selectOption(String(f.house.id));
  await page
    .getByRole("button", { name: "Recibos y distribución", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Ver recibo ${r.id} y reparto`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calcular reparto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Resumen del reparto · Calculado/ }),
  ).toBeVisible();
  await expect(page.locator(".utility-total")).toContainText("Bs 300,00");
});

test("contratos sucesivos exigen revisión manual antes de confirmar", async ({
  page,
}, info) => {
  await authenticate(page);
  page.on("dialog", (d) => d.accept());
  const f = await setup(page);
  await rent(page, f, f.a.id, f.one.id, "2031-01-01", "2031-01-15");
  await rent(page, f, f.a.id, f.two.id, "2031-01-16", "2031-01-30");
  const r = await post(
    page,
    `/service-accounts/${f.account.id}/receipts`,
    receiptBody(`REV-${f.house.id}`),
  );
  await enter(page, f.house.id);
  await page
    .getByRole("button", { name: "Recibos y distribución", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Ver recibo ${r.id} y reparto`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calcular reparto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /Resumen del reparto · Requiere revisión/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar distribución", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("superan");
  await capture(page, info, "revision");
  await page
    .getByRole("button", { name: "Revisar importes manualmente", exact: true })
    .click();
  await page
    .getByLabel("Importe de responsabilidad 1", { exact: true })
    .fill("75");
  await page
    .getByLabel("Importe de responsabilidad 2", { exact: true })
    .fill("75");
  await page
    .getByLabel("Importe de responsabilidad 3", { exact: true })
    .fill("0");
  await page
    .getByLabel("Motivo del reparto revisado")
    .fill("Cada contrato asume 75 y el propietario asume el cuarto vacío");
  await page
    .getByRole("button", { name: "Guardar revisión manual", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar distribución", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirmar distribución", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Distribución confirmada",
  );
  await capture(page, info, "confirmacion");
});

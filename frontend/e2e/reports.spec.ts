import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { authenticate, apiBase } from "./helpers";
test.setTimeout(180000);
test.use({ locale: "es-BO", timezoneId: "America/La_Paz" });
const key = () => crypto.randomUUID().replaceAll("-", "");
async function get(page: Page, path: string) {
  const r = await page.request.get(`${apiBase}/api/v1${path}`);
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function post(page: Page, path: string, data: object, status = 201) {
  const r = await page.request.post(`${apiBase}/api/v1${path}`, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
  return r.json();
}
async function setup(page: Page, extended = false) {
  await authenticate(page);
  const suffix = key().slice(0, 8);
  const owner = await post(page, "/persons", {
    full_name: `Ana reportes ${suffix}`,
    is_owner: true,
  });
  const coowner = await post(page, "/persons", {
    full_name: `Luis copropietario ${suffix}`,
    is_owner: true,
  });
  const house = await post(page, "/properties", {
    name: `Casa del jardín ${suffix}`,
    address: "Dirección ficticia para evidencias",
    city: "La Paz",
    owners: [
      { person_id: owner.id, share: 60 },
      { person_id: coowner.id, share: 40 },
    ],
  });
  const units = [];
  for (const code of ["A", "B", "C"])
    units.push(
      await post(page, `/properties/${house.id}/units`, {
        code,
        name: `Cuarto ${code} del jardín`,
        unit_type: "cuarto",
      }),
    );
  const tenant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Inquilina ficticia ${suffix}`,
  });
  const occupant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Ocupante ficticio ${suffix}`,
  });
  const catalogs = await get(page, "/finances/catalogs");
  const method =
    catalogs.methods.find((m: { name: string }) => m.name === "Efectivo") ||
    (await post(page, "/finances/catalogs/methods", { name: "Efectivo" }));
  const category =
    catalogs.categories.find(
      (m: { name: string }) => m.name === "Reparaciones",
    ) ||
    (await post(page, "/finances/catalogs/categories", {
      name: "Reparaciones",
    }));
  if (
    !catalogs.categories.some(
      (m: { name: string }) => m.name === "Servicios básicos",
    )
  )
    await post(page, "/finances/catalogs/categories", {
      name: "Servicios básicos",
    });
  const today = (await get(page, "/reports/options")).today as string;
  const start = today.slice(0, 8) + "01";
  const d = new Date(today + "T12:00:00Z");
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const base = `/properties/${house.id}/finances`;
  const c = await post(page, "/contracts", {
    unit_id: units[0].id,
    responsible_person_id: tenant.id,
    occupant_ids: [occupant.id],
    owner_parties: [
      { person_id: owner.id, share: 60 },
      { person_id: coowner.id, share: 40 },
    ],
    mode: "monthly",
    status: "active",
    start_date: start,
    end_date: end,
    currency: "BOB",
    price: "500",
    monthly_period: "calendar",
    first_period: "full",
    due_day: 5,
    payment_timing: "advance",
    services_included: false,
  });
  const generated = await post(page, `${base}/contracts/${c.id}/generate`, {
    request_key: key(),
    expected_version: c.version,
    through: today,
  });
  const oid = generated.obligation_ids[0] as number;
  const cash = {
    currency: "BOB",
    occurred_on: today,
    method_id: method.id,
    payer_id: tenant.id,
  };
  await post(page, `${base}/receive`, {
    request_key: key(),
    person_id: tenant.id,
    amount: "200",
    applications: [{ obligation_id: oid, amount: "200" }],
    ...cash,
  });
  if (extended) {
    await post(page, `${base}/receive`, {
      request_key: key(),
      person_id: tenant.id,
      amount: "25",
      applications: [],
      surplus: "advance",
      ...cash,
    });
    await post(page, `${base}/guarantees`, {
      request_key: key(),
      person_id: tenant.id,
      contract_id: c.id,
      conditions: "Garantía ficticia independiente",
      amount: "100",
      ...cash,
    });
    await post(page, `${base}/receive`, {
      request_key: key(),
      person_id: tenant.id,
      amount: "30",
      applications: [],
      surplus: "credit",
      ...cash,
      currency: "USD",
    });
    const exp = await post(page, `${base}/expenses`, {
      request_key: key(),
      person_id: owner.id,
      currency: "BOB",
      amount: "300",
      recorded_on: today,
      category_id: category.id,
      description: "Reparación ficticia del patio",
    });
    await post(page, `${base}/expenses/${exp.expense_id}/pay`, {
      request_key: key(),
      amount: "100",
      ...cash,
      payer_id: owner.id,
    });
    const antic = await post(page, "/contracts", {
      unit_id: units[2].id,
      responsible_person_id: tenant.id,
      occupant_ids: [],
      owner_parties: [
        { person_id: owner.id, share: 60 },
        { person_id: coowner.id, share: 40 },
      ],
      mode: "anticretico",
      status: "active",
      start_date: start,
      end_date: end,
      price: null,
      currency: "BOB",
      payment_timing: "custom",
      due_terms: "Restitución pactada según el acuerdo ficticio",
      services_included: false,
    });
    const anti = `/properties/${house.id}/anticreticos/${antic.id}`;
    const saved = await post(page, anti + "/conditions", {
      request_key: key(),
      expected_version: 0,
      expected_contract_version: antic.version,
      agreed_capital: "6000",
      expected_delivery_on: today,
      restitution_on: end,
      allow_early_return: true,
      conditions: "Acuerdo ficticio para comprobar reportes",
      document_reference: "Documento ficticio de prueba",
      holders: [
        {
          person_id: tenant.id,
          assigned_amount: "6000",
          beneficiary_person_id: tenant.id,
        },
      ],
      responsibles: [{ person_id: owner.id, assigned_amount: "6000" }],
    });
    const ad = await get(page, anti);
    const body = {
      expected_contract_version: antic.version,
      expected_version: ad.version,
      currency: "BOB",
      occurred_on: today,
      method_id: method.id,
      payer_id: tenant.id,
      beneficiary_person_id: owner.id,
      allocations: [
        { holder_id: tenant.id, responsible_id: owner.id, amount: "1000" },
      ],
    };
    await post(page, anti + "/deliveries", {
      ...body,
      request_key: key(),
      amount: "1000",
    });
    const ad2 = await get(page, anti);
    await post(page, anti + "/returns", {
      ...body,
      expected_version: ad2.version,
      request_key: key(),
      amount: "250",
      payer_id: owner.id,
      beneficiary_person_id: tenant.id,
      allocations: [
        { holder_id: tenant.id, responsible_id: owner.id, amount: "250" },
      ],
    });
    void saved;
    const types = await get(page, "/utility-types");
    const type =
      types[0] || (await post(page, "/utility-types", { name: "Agua" }));
    const account = await post(
      page,
      `/properties/${house.id}/service-accounts`,
      {
        type_id: type.id,
        label: "Agua del jardín",
        provider: "Proveedor ficticio",
        measurement_kind: "shared",
        start_date: start,
        configuration: {
          method: "equal",
          unit_ids: units.map((u) => u.id),
          owner_person_id: owner.id,
          provider_payer_id: owner.id,
          reimbursement_person_id: owner.id,
        },
      },
    );
    const receipt = await post(
      page,
      `/service-accounts/${account.id}/receipts`,
      {
        amount: "300",
        currency: "BOB",
        issued_on: today,
        period_start: start,
        period_end: today,
        due_on: end,
        external_reference: `REC-${suffix}`,
      },
    );
    const dist = await post(page, `/utility-receipts/${receipt.id}/calculate`, {
      request_key: key(),
      expected_version: receipt.version,
    });
    await post(
      page,
      `/utility-distributions/${dist.id}/confirm`,
      {
        expected_version: dist.version,
        expected_receipt_version: dist.receipt_version,
      },
      200,
    );
    await post(page, `${base}/receipts/${receipt.id}/import`, {
      request_key: key(),
      expected_distribution_id: dist.id,
      owner_person_id: owner.id,
    });
  }
  return {
    house,
    owner,
    coowner,
    tenant,
    units,
    method,
    today,
    start,
    end,
    oid,
    base,
    cash,
    suffix,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function enter(page: Page, f: Fixture, dashboard = false) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: dashboard ? "Resumen general" : "Reportes",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Propiedad", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Propiedad", exact: true })
    .selectOption(String(f.house.id));
  await expect(
    page.getByRole("button", { name: "Ver resultados", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Ver resultados", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Resultados del reporte" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page
      .getByRole("region", { name: "Resultados del reporte" })
      .getByText(f.house.name, { exact: true }),
  ).toBeVisible();
}
function screenshot(page: Page, info: TestInfo, name: string) {
  mkdirSync("../docs/screenshots/phase-7", { recursive: true });
  return page.screenshot({
    path: `../docs/screenshots/phase-7/${info.project.name}-${name}.png`,
    fullPage: false,
  });
}

test("dashboard, API y PDF concilian con monedas y capital separados", async ({
  page,
}, info) => {
  const f = await setup(page, true);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, f, true);
  const api = await get(
    page,
    `/reports/economic?property_id=${f.house.id}&start_date=${f.start}&end_date=${f.today}`,
  );
  const bob = api.summary.find(
    (x: { currency: string }) => x.currency === "BOB",
  );
  await expect(
    page.getByRole("article", {
      name: "Total de entradas reales",
      exact: true,
    }),
  ).toContainText(`${bob.cash_received} BOB`);
  await expect(
    page.getByRole("article", {
      name: "Capital pendiente de devolución",
      exact: true,
    }),
  ).toContainText("750.00 BOB");
  await page
    .getByRole("region", { name: "Resultados del reporte" })
    .locator("h2")
    .first()
    .scrollIntoViewIfNeeded();
  await screenshot(page, info, "resumen");
  await page
    .getByLabel("Moneda para las cifras y gráficos")
    .selectOption("USD");
  await expect(
    page.getByRole("article", {
      name: "Total de entradas reales",
      exact: true,
    }),
  ).toContainText("30.00 USD");
  await page
    .getByLabel("Moneda para las cifras y gráficos")
    .selectOption("BOB");
  await expect(
    page.getByRole("img", { name: /Dinero recibido por periodo/ }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Gráficos del reporte" })
    .locator("h2")
    .first()
    .scrollIntoViewIfNeeded();
  await screenshot(page, info, "graficos");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  const file = await download;
  mkdirSync("../docs/pdf/phase-7", { recursive: true });
  await file.saveAs(`../docs/pdf/phase-7/economico-${info.project.name}.pdf`);
  writeFileSync(
    `../docs/pdf/phase-7/esperado-${info.project.name}.json`,
    JSON.stringify(
      {
        summary: api.summary,
        fingerprint: api.fingerprint,
        properties: api.properties,
        period: api.period,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test("diez reportes accesibles y capturas por tipo", async ({ page }, info) => {
  const f = await setup(page, true);
  await enter(page, f);
  for (const [kind, title] of [
    ["economic", "Reporte económico general"],
    ["properties", "Reporte por propiedad"],
    ["owners", "Reporte por propietario"],
    ["units", "Reporte por unidad"],
    ["contracts", "Reporte por contrato"],
    ["collections", "Cobranzas y deudas"],
    ["services", "Servicios básicos"],
    ["expenses", "Gastos"],
    ["capital", "Capital de anticréticos"],
    ["comparison", "Comparar propiedades y periodos"],
  ]) {
    await page.getByLabel("Tipo de reporte").selectOption(kind);
    await page
      .getByRole("button", { name: "Ver resultados", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Resultados del reporte" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Resultados del reporte" })
        .getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Resultados del reporte" })
      .locator("h2")
      .first()
      .scrollIntoViewIfNeeded();
    await screenshot(page, info, kind);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(await page.getByLabel("Tipo de reporte").inputValue()).toBe(kind);
    if (
      info.project.name === "escritorio" &&
      ["services", "capital", "owners", "contracts", "properties"].includes(
        kind,
      )
    ) {
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Exportar PDF", exact: true })
        .click();
      const file = await pending;
      mkdirSync("../docs/pdf/phase-7", { recursive: true });
      await file.saveAs(`../docs/pdf/phase-7/${kind}-ejemplo.pdf`);
    }
  }
});

test("cambios consecutivos de filtros y gráficos no producen errores de ciclo de vida", async ({
  page,
}) => {
  const f = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, f);
  for (const name of ["Mes anterior", "Este mes", "Últimos tres meses"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", { name: "Ver resultados", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Resultados del reporte" }),
    ).toBeVisible();
  }
  await page.getByLabel("Medida para ver su evolución").selectOption("pending");
  await expect(
    page.getByRole("img", { name: /Evolución de la medida/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("un pago posterior obliga a actualizar antes de descargar el PDF", async ({
  page,
}) => {
  const f = await setup(page);
  await enter(page, f);
  await post(page, `${f.base}/receive`, {
    request_key: key(),
    person_id: f.tenant.id,
    amount: "50",
    applications: [{ obligation_id: f.oid, amount: "50" }],
    ...f.cash,
  });
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Los datos cambiaron");
  await expect(
    page.getByText("El reporte está listo para descargar."),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver resultados", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Alquiler pendiente", exact: true }),
  ).toContainText("250.00 BOB");
});

test("vacío, error recuperable, teclado y ausencia de desbordamiento", async ({
  page,
}) => {
  const f = await setup(page);
  await enter(page, f);
  await page.getByRole("combobox", { name: "Propiedad", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Fecha inicial", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Mes anterior", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver resultados", exact: true })
    .click();
  await expect(page.getByText("No hay datos para este periodo.")).toBeVisible();
  await page.route("**/api/v1/reports/economic?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "El reporte no está disponible. Vuelva a consultar.",
      }),
    }),
  );
  await page.getByRole("button", { name: "Este mes", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver resultados", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("no está disponible");
  await page.unroute("**/api/v1/reports/economic?*");
  await page
    .getByRole("button", { name: "Volver a consultar", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Resultados del reporte" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("operador no obtiene reportes ni PDF de otra propiedad", async ({
  page,
}) => {
  const f = await setup(page);
  const other = await setup(page);
  const password = key() + key();
  const account = await post(page, "/users", {
    username: `report_operator_${f.suffix}`,
    full_name: "Operador ficticio de reportes",
    password,
    role: "operator",
    property_ids: [f.house.id],
  });
  await post(
    page,
    "/auth/login",
    { username: account.username, password },
    200,
  );
  for (const ending of ["", "/pdf"]) {
    const r = await page.request.get(
      `${apiBase}/api/v1/reports/economic${ending}?property_id=${other.house.id}`,
    );
    expect(r.status()).toBe(404);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Propiedad", exact: true }),
  ).not.toContainText(other.house.name);
  await expect(
    page.getByRole("region", { name: "Resultados del reporte" }),
  ).toBeVisible();
});

test("lectura concurrente con un pago mantiene una instantánea conciliada en MySQL", async ({
  page,
}) => {
  const f = await setup(page);
  const path = `/reports/economic?property_id=${f.house.id}&start_date=${f.start}&end_date=${f.today}`;
  const [during] = await Promise.all([
    get(page, path),
    post(page, `${f.base}/receive`, {
      request_key: key(),
      person_id: f.tenant.id,
      amount: "100",
      applications: [{ obligation_id: f.oid, amount: "100" }],
      ...f.cash,
    }),
  ]);
  const group = during.summary.find(
    (x: { currency: string }) => x.currency === "BOB",
  );
  expect([
    ["200.00", "300.00"],
    ["300.00", "200.00"],
  ]).toContainEqual([group.obligations_applied, group.pending]);
  const after = await get(page, path);
  expect(
    after.summary.find((x: { currency: string }) => x.currency === "BOB")
      .pending,
  ).toBe("200.00");
});

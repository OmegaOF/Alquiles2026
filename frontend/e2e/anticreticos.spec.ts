import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase } from "./helpers";

test.setTimeout(90000);
test.use({ locale: "es-BO", timezoneId: "America/La_Paz" });
const key = () => crypto.randomUUID().replaceAll("-", "");
async function post(page: Page, path: string, data: object, status = 201) {
  const r = await page.request.post(`${apiBase}/api/v1${path}`, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
  return r.json();
}
async function get(page: Page, path: string) {
  const r = await page.request.get(`${apiBase}/api/v1${path}`);
  expect(r.ok(), path).toBe(true);
  return r.json();
}
async function setup(
  page: Page,
  whole = false,
  dates = { start_date: "2031-01-01", end_date: "2032-01-31" },
) {
  await authenticate(page);
  page.on("dialog", (d) => d.accept());
  const suffix = `${Date.now()}-${key().slice(0, 5)}`;
  const owner = await post(page, "/persons", {
    full_name: `Ana capital ${suffix}`,
    is_owner: true,
  });
  const house = await post(page, "/properties", {
    name: `Casa capital ${suffix}`,
    address: "Dirección ficticia de pruebas",
    city: "La Paz",
    owners: [{ person_id: owner.id, share: 100 }],
  });
  const unit = await post(page, `/properties/${house.id}/units`, {
    code: "A",
    name: "Cuarto del capital",
    unit_type: "cuarto",
  });
  const tenant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Luis titular ${suffix}`,
  });
  const other = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Elena pagadora ${suffix}`,
  });
  const c = await post(page, "/contracts", {
    property_id: whole ? house.id : null,
    unit_id: whole ? null : unit.id,
    responsible_person_id: tenant.id,
    occupant_ids: [],
    owner_parties: [{ person_id: owner.id, share: 100 }],
    mode: "anticretico",
    status: "active",
    ...dates,
    price: null,
    currency: "BOB",
    services_included: false,
  });
  const catalog = await get(page, "/finances/catalogs");
  const method =
    catalog.methods.find((m: { name: string }) => m.name === "Efectivo") ||
    (await post(page, "/finances/catalogs/methods", { name: "Efectivo" }));
  return {
    owner,
    house,
    unit,
    tenant,
    other,
    c,
    method,
    path: `/properties/${house.id}/anticreticos/${c.id}`,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function enter(page: Page, f: Fixture) {
  await page.goto("/");
  await page.getByRole("button", { name: "Anticréticos", exact: true }).click();
  await page
    .getByLabel("Casa de los anticréticos")
    .selectOption(String(f.house.id));
  await page
    .getByRole("button", { name: `Ver capital del contrato ${f.c.id}` })
    .click();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Registro guardado" }),
  ).toBeVisible();
}
async function conditions(page: Page, f: Fixture) {
  await page
    .getByRole("button", { name: "Completar capital acordado", exact: true })
    .click();
  await page.getByLabel("Capital total acordado").fill("70000");
  await page
    .getByLabel("Fecha prevista de entrega del capital")
    .fill("2031-01-01");
  await page.getByLabel("Fecha pactada de restitución").fill("2032-02-01");
  await page
    .getByLabel("El acuerdo permite devolver antes de la fecha pactada")
    .check();
  await page
    .getByRole("combobox", { name: "Titular 1", exact: true })
    .selectOption(String(f.tenant.id));
  await page
    .getByRole("combobox", {
      name: "Persona autorizada a recibir por titular 1",
      exact: true,
    })
    .selectOption(String(f.tenant.id));
  await page
    .getByLabel("Importe acordado de titular 1", { exact: true })
    .fill("70000");
  await page
    .getByRole("combobox", { name: "Responsable 1", exact: true })
    .selectOption(String(f.owner.id));
  await page
    .getByLabel("Importe acordado de responsable 1", { exact: true })
    .fill("70000");
  await page
    .getByLabel("Condiciones particulares pactadas")
    .fill(
      "Acuerdo ficticio: titulares y responsables con importes expresos, servicios independientes.",
    );
  await page
    .getByLabel("Referencia del documento externo", { exact: true })
    .fill("Documento ficticio externo de pruebas");
  await page
    .getByRole("button", { name: "Revisar y guardar condiciones" })
    .click();
  await saved(page);
}
async function cash(
  page: Page,
  f: Fixture,
  amount: string,
  kind: "delivery" | "return",
  payer?: number,
  receiver?: number,
  date = kind === "delivery" ? "2031-01-02" : "2031-02-01",
) {
  await page
    .getByRole("button", {
      name:
        kind === "delivery"
          ? "Registrar entrega de capital"
          : "Registrar devolución de capital",
      exact: true,
    })
    .click();
  await page
    .getByLabel(
      kind === "delivery"
        ? "Importe de capital entregado"
        : "Importe de capital que se devuelve",
      { exact: true },
    )
    .fill(amount);
  await page.getByLabel("Fecha real del movimiento").fill(date);
  await page
    .getByLabel("Método de entrega o devolución")
    .selectOption(String(f.method.id));
  await page
    .getByLabel("Persona que efectivamente entrega o paga")
    .selectOption(
      String(payer || (kind === "delivery" ? f.tenant.id : f.owner.id)),
    );
  await page
    .getByLabel("Persona que efectivamente recibe el dinero")
    .selectOption(
      String(receiver || (kind === "delivery" ? f.owner.id : f.tenant.id)),
    );
  await page.getByLabel("Importe de la parte 1", { exact: true }).fill(amount);
}
async function confirmCash(page: Page) {
  await page.getByRole("button", { name: "Confirmar movimiento real" }).click();
  await saved(page);
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.CAPTURE_PHASE5_SCREENSHOTS !== "1") return;
  mkdirSync("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: `../docs/screenshots/phase-5-${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

test("capital acordado, entregas y devoluciones parciales sin ingresos ordinarios", async ({
  page,
}, info) => {
  const f = await setup(page, true);
  await enter(page, f);
  await expect(
    page.getByRole("heading", { name: "Información económica pendiente" }),
  ).toBeVisible();
  expect((await get(page, f.path)).capital_received).toBe("0.00");
  await capture(page, info, "detalle-pendiente");
  await conditions(page, f);
  expect((await get(page, f.path)).capital_pending).toBe("0.00");
  await cash(page, f, "20000", "delivery", f.other.id);
  await capture(page, info, "entrega");
  await confirmCash(page);
  for (const amount of ["30000", "20000"]) {
    await cash(page, f, amount, "delivery");
    await confirmCash(page);
  }
  await cash(page, f, "10000", "return", f.other.id);
  await expect(
    page.getByRole("region", { name: "Revisión del capital" }),
  ).toContainText("60.000,00");
  await capture(page, info, "devolucion");
  await confirmCash(page);
  await cash(page, f, "15000", "return");
  await confirmCash(page);
  const d = await get(page, f.path);
  expect([d.capital_received, d.capital_returned, d.capital_pending]).toEqual([
    "70000.00",
    "25000.00",
    "45000.00",
  ]);
  expect(d.contract.status).toBe("active");
  const s = (await get(page, `/properties/${f.house.id}/finances`)).summary[0];
  expect([
    s.received,
    s.disbursed,
    s.guarantees_received,
    s.capital_pending,
  ]).toEqual(["0.00", "0.00", "0.00", "45000.00"]);
  await page
    .getByRole("button", { name: "← Volver al listado de anticréticos" })
    .click();
  await capture(page, info, "listado");
  await page
    .getByRole("button", { name: "Resumen del capital", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Capital en BOB" }),
  ).toBeVisible();
  await capture(page, info, "resumen");
  await page.getByRole("button", { name: "Vencimientos", exact: true }).click();
  await expect(page.getByText(/Esta pantalla consulta fechas/)).toBeVisible();
  await capture(page, info, "vencimientos");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("titulares y responsables expresos, sin deducir importes de copropiedad", async ({
  page,
}, info) => {
  const f = await setup(page);
  await enter(page, f);
  await page
    .getByRole("button", { name: "Completar capital acordado", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Responsable 1", exact: true }),
  ).toHaveValue("");
  await page.getByLabel("Capital total acordado").fill("70000");
  await page
    .getByLabel("Fecha prevista de entrega del capital")
    .fill("2031-01-01");
  await page.getByLabel("Fecha pactada de restitución").fill("2032-02-01");
  await page
    .getByLabel("El acuerdo permite devolver antes de la fecha pactada")
    .check();
  await page
    .getByRole("button", { name: "Agregar titular", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar responsable", exact: true })
    .click();
  for (const [i, person, amount] of [
    [1, f.tenant.id, "40000"],
    [2, f.other.id, "30000"],
  ] as const) {
    await page
      .getByRole("combobox", { name: `Titular ${i}`, exact: true })
      .selectOption(String(person));
    await page
      .getByRole("combobox", {
        name: `Persona autorizada a recibir por titular ${i}`,
        exact: true,
      })
      .selectOption(String(f.other.id));
    await page
      .getByLabel(`Importe acordado de titular ${i}`, { exact: true })
      .fill(amount);
  }
  for (const [i, person, amount] of [
    [1, f.owner.id, "40000"],
    [2, f.other.id, "30000"],
  ] as const) {
    await page
      .getByRole("combobox", { name: `Responsable ${i}`, exact: true })
      .selectOption(String(person));
    await page
      .getByLabel(`Importe acordado de responsable ${i}`, { exact: true })
      .fill(amount);
  }
  await page
    .getByLabel("Condiciones particulares pactadas")
    .fill(
      "Partes explícitas con una persona autorizada a recibir por ambos titulares.",
    );
  await page
    .getByLabel("Referencia del documento externo", { exact: true })
    .fill("Respaldo ficticio de las asignaciones");
  await capture(page, info, "condiciones");
  await page
    .getByRole("button", { name: "Revisar y guardar condiciones" })
    .click();
  await saved(page);
  await cash(page, f, "50000", "delivery", f.other.id);
  await page
    .getByRole("combobox", { name: "Titular de la parte 1", exact: true })
    .selectOption(String(f.tenant.id));
  await page
    .getByRole("combobox", { name: "Responsable de la parte 1", exact: true })
    .selectOption(String(f.owner.id));
  await page.getByLabel("Importe de la parte 1", { exact: true }).fill("30000");
  await page
    .getByRole("button", { name: "Agregar parte", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Titular de la parte 2", exact: true })
    .selectOption(String(f.other.id));
  await page
    .getByRole("combobox", { name: "Responsable de la parte 2", exact: true })
    .selectOption(String(f.other.id));
  await page.getByLabel("Importe de la parte 2", { exact: true }).fill("20000");
  await confirmCash(page);
  await page
    .getByRole("button", { name: "Titulares y responsables", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Responsables contractuales de devolver",
    }),
  ).toBeVisible();
  await capture(page, info, "personas");
  const d = await get(page, f.path);
  expect(d.holders.map((p: { pending: string }) => p.pending).sort()).toEqual([
    "20000.00",
    "30000.00",
  ]);
  expect(
    d.responsibles.map((p: { pending: string }) => p.pending).sort(),
  ).toEqual(["20000.00", "30000.00"]);
  expect(d.capital_pending).toBe("50000.00");
});

test("correcciones, condiciones históricas, prórroga y liquidación independiente", async ({
  page,
}, info) => {
  const f = await setup(page);
  await enter(page, f);
  await conditions(page, f);
  await cash(page, f, "20000", "delivery");
  await confirmCash(page);
  let d = await get(page, f.path);
  async function voidLast(id: number) {
    await page
      .getByRole("button", { name: "Movimientos e historial", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Anular movimiento ${id}`, exact: true })
      .click();
    await page
      .getByLabel("Motivo y autorización")
      .fill("Corrección autorizada; se conserva el original");
    await page
      .getByRole("button", { name: "Revisar y confirmar acuerdo" })
      .click();
    await saved(page);
  }
  await voidLast(d.movements[0].id);
  await cash(page, f, "15000", "delivery");
  await confirmCash(page);
  await cash(page, f, "10000", "return");
  await confirmCash(page);
  d = await get(page, f.path);
  await voidLast(d.movements.at(-1).id);
  await cash(page, f, "5000", "return");
  await confirmCash(page);
  await page
    .getByRole("button", { name: "Modificar condiciones económicas" })
    .click();
  await page.getByLabel("Capital total acordado").fill("80000");
  await page
    .getByLabel("Importe acordado de titular 1", { exact: true })
    .fill("80000");
  await page
    .getByLabel("Importe acordado de responsable 1", { exact: true })
    .fill("80000");
  await page.getByLabel("Fecha pactada de restitución").fill("2032-03-15");
  await page
    .getByLabel("Motivo de la modificación")
    .fill("Ampliación explícita de capital y nueva fecha pactada");
  await page
    .getByRole("button", { name: "Revisar y guardar condiciones" })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Prorrogar ocupación", exact: true })
    .click();
  await page.getByLabel("Nueva fecha final de ocupación").fill("2032-02-29");
  await page
    .getByLabel("Motivo y autorización")
    .fill("Prórroga revisada con disponibilidad");
  await page
    .getByRole("button", { name: "Revisar y confirmar acuerdo" })
    .click();
  await saved(page);
  await page
    .getByRole("button", {
      name: "Registrar acuerdo de restitución",
      exact: true,
    })
    .click();
  await page.getByLabel("Fecha efectiva del acuerdo").fill("2031-03-01");
  await page
    .getByLabel("Referencia del acuerdo externo autorizado")
    .fill("Liquidación ficticia sin compensar servicios");
  await page.getByLabel("Importe de la parte 1", { exact: true }).fill("10000");
  await page
    .getByLabel("Motivo y autorización")
    .fill("Reducción documentada y autorizada por las partes");
  await page
    .getByRole("button", { name: "Revisar y confirmar acuerdo" })
    .click();
  await saved(page);
  d = await get(page, f.path);
  expect([d.capital_received, d.capital_returned, d.capital_pending]).toEqual([
    "15000.00",
    "5000.00",
    "0.00",
  ]);
  expect(d.state).toBe("settled_by_agreement");
  expect(d.contract.status).toBe("active");
  expect(d.contract.end_date).toBe("2032-02-29");
  expect(d.history).toHaveLength(2);
  expect(
    d.movements.filter(
      (m: { void_operation_id: number | null }) => m.void_operation_id,
    ),
  ).toHaveLength(2);
  await page
    .getByRole("button", { name: "Capital y cierre", exact: true })
    .click();
  await capture(page, info, "cierre");
  await page
    .getByRole("button", { name: "Movimientos e historial", exact: true })
    .click();
  await capture(page, info, "historial");
});

test("fin de ocupación y restitución no cancelan deuda de servicios", async ({
  page,
}, info) => {
  const f = await setup(page, false, {
    start_date: "2025-01-01",
    end_date: "2026-10-31",
  });
  await enter(page, f);
  await conditions(page, f);
  await cash(page, f, "50000", "delivery", undefined, undefined, "2025-01-02");
  await confirmCash(page);
  const type = await post(page, "/utility-types", {
    name: `Electricidad capital ${key().slice(0, 8)}`,
  });
  const account = await post(
    page,
    `/properties/${f.house.id}/service-accounts`,
    {
      type_id: type.id,
      label: "Electricidad del anticrético",
      provider: "Proveedor ficticio de pruebas",
      measurement_kind: "individual",
      start_date: "2025-01-01",
      configuration: {
        method: "equal",
        unit_ids: [f.unit.id],
        owner_person_id: f.owner.id,
        provider_payer_id: f.owner.id,
        reimbursement_person_id: f.owner.id,
      },
    },
  );
  const r = await post(page, `/service-accounts/${account.id}/receipts`, {
    external_reference: `CAP-${key()}`,
    amount: "150",
    currency: "BOB",
    issued_on: "2025-01-31",
    period_start: "2025-01-01",
    period_end: "2025-01-31",
    due_on: "2025-02-10",
  });
  const distribution = await post(page, `/utility-receipts/${r.id}/calculate`, {
    expected_version: r.version,
    request_key: key(),
  });
  await post(
    page,
    `/utility-distributions/${distribution.id}/confirm`,
    {
      expected_version: distribution.version,
      expected_receipt_version: distribution.receipt_version,
    },
    200,
  );
  await post(
    page,
    `/properties/${f.house.id}/finances/receipts/${r.id}/import`,
    {
      request_key: key(),
      expected_distribution_id: distribution.id,
      owner_person_id: f.owner.id,
    },
  );
  await post(
    page,
    `/contracts/${f.c.id}/actions`,
    {
      action: "finish",
      expected_version: 1,
      end_date: "2026-10-31",
      reason: "Salida efectiva sin liquidar el capital",
    },
    200,
  );
  await page
    .getByRole("button", { name: "Actualizar datos", exact: true })
    .click();
  await expect
    .poll(async () => (await get(page, f.path)).contract.status)
    .toBe("finished");
  await cash(page, f, "50000", "return", undefined, undefined, "2026-11-01");
  await confirmCash(page);
  const d = await get(page, f.path);
  expect(d.capital_pending).toBe("0.00");
  expect(d.service_obligations[0].pending).toBe("150.00");
  await page
    .getByRole("button", { name: "Servicios básicos", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Servicios independientes del capital" }),
  ).toBeVisible();
  await expect(page.getByText(/150,00/)).toBeVisible();
  await capture(page, info, "servicios");
});

test("propietario consulta y operador solo prepara entregas en sus casas", async ({
  page,
}) => {
  const f = await setup(page);
  await enter(page, f);
  await conditions(page, f);
  const password = `Prueba-${key()}`;
  const owner = await post(page, "/users", {
    username: `owner_${key().slice(0, 12)}`,
    person_id: f.owner.id,
    full_name: f.owner.full_name,
    password,
    role: "owner",
    property_ids: [],
  });
  const operator = await post(page, "/users", {
    username: `operator_${key().slice(0, 12)}`,
    full_name: "Operador ficticio",
    password,
    role: "operator",
    property_ids: [f.house.id],
  });
  for (const [account, canDeliver] of [
    [owner, false],
    [operator, true],
  ] as const) {
    await post(
      page,
      "/auth/login",
      { username: account.username, password },
      200,
    );
    await enter(page, f);
    await expect(
      page.getByRole("heading", { name: "Capital acordado y dinero real" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Registrar devolución de capital",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Modificar condiciones económicas",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Registrar entrega de capital",
        exact: true,
      }),
    ).toHaveCount(canDeliver ? 1 : 0);
    const denied = await page.request.post(
      `${apiBase}/api/v1${f.path}/adjustments`,
      {
        data: {
          request_key: key(),
          expected_version: 1,
          expected_contract_version: 1,
          reason: "Sin autorización",
          document_reference: "Prueba",
          effective_on: "2031-02-01",
          kind: "additional",
          allocations: [
            { holder_id: f.tenant.id, responsible_id: f.owner.id, delta: "1" },
          ],
        },
      },
    );
    expect(denied.status()).toBe(403);
  }
});

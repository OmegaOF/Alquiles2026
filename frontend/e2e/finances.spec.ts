import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase } from "./helpers";

test.setTimeout(90000);
test.use({ locale: "es-BO", timezoneId: "America/La_Paz" });
async function request(page: Page, path: string, data: object, code = 201) {
  const r = await page.request.post(`${apiBase}/api/v1${path}`, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(code);
  return r.json();
}
const key = () => crypto.randomUUID().replaceAll("-", "");
async function setup(page: Page) {
  await authenticate(page);
  page.on("dialog", async (d) => d.accept());
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const owner = await request(page, "/persons", {
    full_name: `Propietaria pagos ${suffix}`,
    is_owner: true,
  });
  const house = await request(page, "/properties", {
    name: `Casa pagos ${suffix}`,
    address: "Calle ficticia de pruebas",
    city: "La Paz",
    owners: [{ person_id: owner.id, share: 100 }],
  });
  const a = await request(page, `/properties/${house.id}/units`, {
    code: "A",
    name: "Cuarto del patio",
    unit_type: "cuarto",
  });
  const b = await request(page, `/properties/${house.id}/units`, {
    code: "B",
    name: "Cuarto de la ventana",
    unit_type: "cuarto",
  });
  const one = await request(page, `/properties/${house.id}/contacts`, {
    full_name: `Inquilino uno pagos ${suffix}`,
  });
  const two = await request(page, `/properties/${house.id}/contacts`, {
    full_name: `Inquilino dos pagos ${suffix}`,
  });
  const cat = await (
    await page.request.get(`${apiBase}/api/v1/finances/catalogs`)
  ).json();
  const method =
    cat.methods.find((x: { name: string }) => x.name === "Efectivo") ||
    (await request(page, "/finances/catalogs/methods", { name: "Efectivo" }));
  const category =
    cat.categories.find((x: { name: string }) => x.name === "Reparaciones") ||
    (await request(page, "/finances/catalogs/categories", {
      name: "Reparaciones",
    }));
  if (
    !cat.categories.some(
      (x: { name: string }) => x.name === "Servicios básicos",
    )
  )
    await request(page, "/finances/catalogs/categories", {
      name: "Servicios básicos",
    });
  return {
    owner,
    house,
    a,
    b,
    one,
    two,
    method,
    category,
    base: `/properties/${house.id}/finances`,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function rent(
  page: Page,
  f: Fixture,
  unit: number,
  person: number,
  end = "2031-02-28",
) {
  return request(page, "/contracts", {
    property_id: null,
    unit_id: unit,
    responsible_person_id: person,
    owner_parties: [{ person_id: f.owner.id, share: 100 }],
    mode: "monthly",
    status: "active",
    start_date: "2031-01-01",
    end_date: end,
    price: "500",
    currency: "BOB",
    monthly_period: "calendar",
    first_period: "full",
    due_day: 5,
    services_included: false,
  });
}
async function enter(page: Page, f: Fixture, tab = "Resumen económico") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pagos y gastos", exact: true })
    .click();
  await page
    .getByLabel("Casa de los pagos y gastos")
    .selectOption(String(f.house.id));
  await page.getByRole("button", { name: tab, exact: true }).click();
}
async function state(page: Page, f: Fixture) {
  return (await page.request.get(`${apiBase}/api/v1${f.base}`)).json();
}
async function generateUI(
  page: Page,
  contract: number,
  through = "2031-01-01",
) {
  await page.getByRole("button", { name: "Por cobrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Generar alquileres", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Contrato", exact: true })
    .selectOption(String(contract));
  await page.getByLabel("Generar periodos que comiencen hasta").fill(through);
  await page
    .getByRole("button", { name: "Revisar importes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar y confirmar registro" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Revisar y confirmar registro" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Operación registrada" }),
  ).toBeVisible();
}
async function cashUI(page: Page, f: Fixture, amount: string, payer: number) {
  await page.getByLabel("Importe del dinero realmente entregado").fill(amount);
  await page.getByLabel("Fecha del pago", { exact: true }).fill("2031-02-01");
  await page
    .getByRole("combobox", { name: "Método de pago", exact: true })
    .selectOption(String(f.method.id));
  await page
    .getByRole("combobox", {
      name: "Persona que entrega o paga el dinero",
      exact: true,
    })
    .selectOption(String(payer));
}
async function submit(page: Page) {
  await page
    .getByRole("button", { name: "Revisar y confirmar registro" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Operación registrada" }),
  ).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.CAPTURE_PHASE4_SCREENSHOTS !== "1") return;
  mkdirSync("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: `../docs/screenshots/phase-4-${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

test("alquiler, pago parcial, sobrante explícito y aplicación posterior de anticipo", async ({
  page,
}, info) => {
  const f = await setup(page);
  const c = await rent(page, f, f.a.id, f.one.id);
  await enter(page, f);
  await generateUI(page, c.id);
  let s = await state(page, f);
  const oid = s.obligations[0].id;
  await capture(page, info, "por-cobrar");
  await page
    .getByRole("button", { name: "Registrar pago para esta persona" })
    .click();
  await cashUI(page, f, "200", f.one.id);
  await page.getByLabel(`Aplicar a Alquiler n.º ${oid}`).fill("200");
  await capture(page, info, "registrar-pago");
  await submit(page);
  await page.getByRole("button", { name: "Deudas", exact: true }).click();
  await expect(page.getByText(/Pagado parcialmente/)).toBeVisible();
  await capture(page, info, "deudas");
  await page
    .getByRole("button", { name: "Registrar pago para esta persona" })
    .click();
  await cashUI(page, f, "400", f.one.id);
  await page.getByLabel(`Aplicar a Alquiler n.º ${oid}`).fill("300");
  await page
    .getByRole("combobox", { name: "Si queda dinero sin aplicar" })
    .selectOption("credit");
  await submit(page);
  s = await state(page, f);
  expect(s.summary[0].received).toBe("600.00");
  expect(s.summary[0].credit_available).toBe("100.00");
  await page
    .getByRole("button", { name: "Historial de pagos", exact: true })
    .click();
  await capture(page, info, "historial");
  await generateUI(page, c.id, "2031-02-01");
  s = await state(page, f);
  const next = s.obligations.find(
    (x: { period_start: string }) => x.period_start === "2031-02-01",
  );
  const credit = s.movements.find(
    (x: { available: string }) => x.available === "100.00",
  );
  await page.getByRole("button", { name: "Anticipos", exact: true }).click();
  await capture(page, info, "anticipos");
  await page
    .getByRole("button", { name: `Aplicar saldo ${credit.id}`, exact: true })
    .click();
  await page.getByLabel(`Aplicar a Alquiler n.º ${next.id}`).fill("100");
  await page
    .getByLabel("Motivo de la operación")
    .fill("Aplicación de anticipo acordada");
  await submit(page);
  s = await state(page, f);
  expect(s.summary[0].received).toBe("600.00");
  expect(s.summary[0].pending).toBe("400.00");
  expect(s.summary[0].credit_available).toBe("0.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("garantía separada, aplicación autorizada, devolución y gasto pagado parcialmente", async ({
  page,
}, info) => {
  const f = await setup(page);
  const c = await rent(page, f, f.a.id, f.one.id);
  await enter(page, f);
  await generateUI(page, c.id);
  let s = await state(page, f);
  const oid = s.obligations[0].id;
  await page.getByRole("button", { name: "Garantías", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar garantía", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Persona titular de la obligación o del saldo",
      exact: true,
    })
    .selectOption(String(f.one.id));
  await page
    .getByRole("combobox", { name: "Contrato", exact: true })
    .selectOption(String(c.id));
  await cashUI(page, f, "500", f.one.id);
  await page
    .getByLabel("Condiciones pactadas de la garantía")
    .fill("Garantía reembolsable con autorización");
  await submit(page);
  s = await state(page, f);
  const g = s.movements[0];
  expect(s.summary[0].received).toBe("0.00");
  await page
    .getByRole("button", { name: `Aplicar saldo ${g.id}`, exact: true })
    .click();
  await page.getByLabel(`Aplicar a Alquiler n.º ${oid}`).fill("100");
  await page
    .getByRole("checkbox", {
      name: /Autorizo expresamente aplicar esta garantía/,
    })
    .check();
  await page
    .getByLabel("Motivo de la operación")
    .fill("Autorizado por el titular y propietario");
  await submit(page);
  await page
    .getByRole("button", { name: `Registrar devolución ${g.id}`, exact: true })
    .click();
  await cashUI(page, f, "400", f.owner.id);
  await page
    .getByLabel("Motivo de la operación")
    .fill("Devolución real de la parte no aplicada");
  await submit(page);
  await capture(page, info, "garantias");
  s = await state(page, f);
  expect(s.summary[0].guarantees_available).toBe("0.00");
  expect(s.summary[0].refunded).toBe("400.00");
  await page.getByRole("button", { name: "Gastos", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Persona responsable del gasto",
      exact: true,
    })
    .selectOption(String(f.owner.id));
  await page
    .getByRole("combobox", { name: "Categoría del gasto", exact: true })
    .selectOption(String(f.category.id));
  await page
    .getByLabel("Descripción del gasto")
    .fill("Reparación de tubería del patio");
  await page.getByLabel("Importe del gasto registrado").fill("250");
  await page.getByLabel("Fecha del gasto").fill("2031-01-05");
  await submit(page);
  await capture(page, info, "gasto-registrado");
  s = await state(page, f);
  const eid = s.expenses[0].id;
  expect(s.summary[0].disbursed).toBe("0.00");
  for (const amount of ["100", "150"]) {
    await page
      .getByRole("button", {
        name: `Registrar pago del gasto ${eid}`,
        exact: true,
      })
      .click();
    await cashUI(page, f, amount, f.owner.id);
    await page
      .getByRole("textbox", {
        name: "Empresa u otro destinatario (si corresponde)",
      })
      .fill("Proveedor de reparación ficticio");
    await submit(page);
  }
  await page
    .getByRole("button", { name: "Pagos realizados", exact: true })
    .click();
  await capture(page, info, "pagos-realizados");
  await page
    .getByRole("button", { name: "Resumen económico", exact: true })
    .click();
  await capture(page, info, "resumen");
  s = await state(page, f);
  expect(s.summary[0].expenses_registered).toBe("250.00");
  expect(s.summary[0].disbursed).toBe("250.00");
  expect(s.summary[0].received).toBe("0.00");
});

async function service(page: Page, f: Fixture, two = true, approve = true) {
  await rent(page, f, f.a.id, f.one.id, two ? "2031-01-14" : "2031-01-31");
  if (two) await rent(page, f, f.b.id, f.two.id, "2031-01-15");
  const types = await (
    await page.request.get(`${apiBase}/api/v1/utility-types`)
  ).json();
  const type =
    types.find((x: { name: string }) => x.name === "Electricidad") ||
    (await request(page, "/utility-types", { name: "Electricidad" }));
  const a = await request(page, `/properties/${f.house.id}/service-accounts`, {
    type_id: type.id,
    label: `Electricidad gastos ${f.house.id}`,
    provider: "Proveedor eléctrico de prueba",
    account_number: `SUP-${f.house.id}`,
    measurement_kind: "shared",
    start_date: "2020-01-01",
    configuration: {
      method: "equal",
      unit_ids: [f.a.id, f.b.id],
      owner_person_id: f.owner.id,
      provider_payer_id: f.owner.id,
      reimbursement_person_id: f.owner.id,
    },
  });
  const r = await request(page, `/service-accounts/${a.id}/receipts`, {
    amount: "300",
    currency: "BOB",
    external_reference: `EXTERNO-${f.house.id}`,
    issued_on: "2031-01-31",
    period_start: "2031-01-01",
    period_end: "2031-01-30",
    due_on: "2031-02-10",
  });
  if (!approve) return r;
  const d = await request(page, `/utility-receipts/${r.id}/calculate`, {
    request_key: key(),
    expected_version: r.version,
  });
  await request(
    page,
    `/utility-distributions/${d.id}/confirm`,
    {
      expected_version: d.version,
      expected_receipt_version: d.receipt_version,
    },
    200,
  );
  return r;
}
async function importUI(page: Page, f: Fixture, receipt: number) {
  await page
    .getByRole("button", { name: "Recuperación de servicios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importar reparto confirmado", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Recibo de proveedor confirmado",
      exact: true,
    })
    .selectOption(String(receipt));
  await page
    .getByRole("combobox", {
      name: "Responsable del registro del gasto del proveedor",
      exact: true,
    })
    .selectOption(String(f.owner.id));
  await submit(page);
}

test("recibo externo 300, pago al proveedor y recuperación real de 70 más 150", async ({
  page,
}, info) => {
  const f = await setup(page);
  const r = await service(page, f);
  await enter(page, f);
  await importUI(page, f, r.id);
  let s = await state(page, f);
  const eid = s.expenses[0].id;
  expect(s.obligations.map((x: { total: string }) => x.total).sort()).toEqual([
    "150.00",
    "70.00",
  ]);
  expect(s.summary[0].owner_services).toBe("80.00");
  await page
    .getByRole("button", {
      name: `Registrar pago al proveedor ${eid}`,
      exact: true,
    })
    .click();
  await cashUI(page, f, "300", f.owner.id);
  await page
    .getByRole("textbox", {
      name: "Empresa u otro destinatario (si corresponde)",
    })
    .fill("Proveedor eléctrico de prueba");
  await submit(page);
  for (const person of [f.one, f.two]) {
    s = await state(page, f);
    const o = s.obligations.find(
      (x: { person_id: number }) => x.person_id === person.id,
    );
    await page
      .getByRole("button", { name: "Registrar pago", exact: true })
      .click();
    await page
      .getByRole("combobox", {
        name: "Persona titular de la obligación o del saldo",
        exact: true,
      })
      .selectOption(String(person.id));
    await cashUI(page, f, o.pending, person.id);
    await page
      .getByRole("combobox", {
        name: "Persona que recibe el dinero",
        exact: true,
      })
      .selectOption(String(f.owner.id));
    await page
      .getByLabel(`Aplicar a Electricidad gastos ${f.house.id} n.º ${o.id}`)
      .fill(o.pending);
    await submit(page);
  }
  await page
    .getByRole("button", { name: "Recuperación de servicios", exact: true })
    .click();
  await capture(page, info, "servicios");
  s = await state(page, f);
  expect(s.summary[0].received).toBe("220.00");
  expect(s.summary[0].disbursed).toBe("300.00");
  expect(s.summary[0].services_recovered).toBe("220.00");
  expect(s.summary[0].owner_services).toBe("80.00");
  expect(s.summary[0].pending).toBe("0.00");
});

test("pago directo documentado del inquilino no inventa caja del propietario", async ({
  page,
}, info) => {
  const f = await setup(page);
  const r = await service(page, f, false);
  await enter(page, f);
  await importUI(page, f, r.id);
  let s = await state(page, f);
  const e = s.expenses[0],
    o = s.obligations[0];
  await page
    .getByRole("button", {
      name: `Registrar pago al proveedor ${e.id}`,
      exact: true,
    })
    .click();
  await cashUI(page, f, "150", f.one.id);
  await page
    .getByLabel("Referencia del comprobante externo (opcional)")
    .fill("Pago externo del inquilino confirmado");
  await page
    .getByRole("checkbox", {
      name: /El inquilino pagó directamente al proveedor/,
    })
    .check();
  await page
    .getByLabel(`Aplicar a Electricidad gastos ${f.house.id} n.º ${o.id}`)
    .fill("150");
  await submit(page);
  await page
    .getByRole("button", { name: "Pagos realizados", exact: true })
    .click();
  await capture(page, info, "pago-directo");
  s = await state(page, f);
  expect(s.summary[0].received).toBe("0.00");
  expect(s.summary[0].disbursed).toBe("0.00");
  expect(s.summary[0].services_direct).toBe("150.00");
  expect(s.summary[0].provider_direct).toBe("150.00");
});

test("gasto y pago al proveedor antes de confirmar reparto, sin duplicar gasto al importar", async ({
  page,
}, info) => {
  const f = await setup(page);
  const r = await service(page, f, false, false);
  await enter(page, f, "Recuperación de servicios");
  await page
    .getByRole("button", {
      name: "Registrar gasto de recibo externo",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", {
      name: "Recibo externo del proveedor",
      exact: true,
    })
    .selectOption(String(r.id));
  await page
    .getByRole("combobox", {
      name: "Responsable del registro del gasto del proveedor",
      exact: true,
    })
    .selectOption(String(f.owner.id));
  await submit(page);
  let s = await state(page, f);
  expect(s.obligations).toHaveLength(0);
  expect(s.expenses).toHaveLength(1);
  const eid = s.expenses[0].id;
  await page
    .getByRole("button", {
      name: `Registrar pago al proveedor ${eid}`,
      exact: true,
    })
    .click();
  await cashUI(page, f, "300", f.owner.id);
  await submit(page);
  await expect(
    page.getByText(/Reparto económico pendiente de confirmar o importar/),
  ).toBeVisible();
  await capture(page, info, "proveedor-sin-reparto");
  const d = await request(page, `/utility-receipts/${r.id}/calculate`, {
    request_key: key(),
    expected_version: r.version,
  });
  await request(
    page,
    `/utility-distributions/${d.id}/confirm`,
    {
      expected_version: d.version,
      expected_receipt_version: d.receipt_version,
    },
    200,
  );
  await enter(page, f);
  await importUI(page, f, r.id);
  s = await state(page, f);
  expect(s.expenses).toHaveLength(1);
  expect(s.expenses[0].id).toBe(eid);
  expect(s.expenses[0].paid).toBe("300.00");
  expect(s.obligations).toHaveLength(1);
  expect(s.summary[0].disbursed).toBe("300.00");
});

import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { authenticate, apiBase, credentials } from "./helpers";

test.setTimeout(90000);
test.use({ locale: "es-BO", timezoneId: "America/La_Paz" });
const key = () => crypto.randomUUID().replaceAll("-", "");
const day = (date: string, n: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
async function get(page: Page, path: string) {
  const r = await page.request.get(`${apiBase}/api/v1${path}`);
  expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
  return r.json();
}
async function post(page: Page, path: string, data: object, status = 201) {
  const r = await page.request.post(`${apiBase}/api/v1${path}`, { data });
  expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
  return r.json();
}
async function setup(page: Page, capital = false) {
  await authenticate(page);
  page.on("dialog", (d) => d.accept());
  const suffix = key().slice(0, 9);
  const owner = await post(page, "/persons", {
    full_name: `Ana avisos ${suffix}`,
    is_owner: true,
    whatsapp: "+12025550123",
  });
  const house = await post(page, "/properties", {
    name: `Casa avisos ${suffix}`,
    address: "Dirección ficticia para pruebas",
    city: "La Paz",
    owners: [{ person_id: owner.id, share: 100 }],
  });
  const unit = await post(page, `/properties/${house.id}/units`, {
    code: "A",
    name: "Cuarto del jardín",
    unit_type: "cuarto",
  });
  const second = await post(page, `/properties/${house.id}/units`, {
    code: "B",
    name: "Cuarto interior",
    unit_type: "cuarto",
  });
  const tenant = await post(page, `/properties/${house.id}/contacts`, {
    full_name: `Luis avisos ${suffix}`,
    whatsapp: "+59171234567",
  });
  // Cada E2E prepara sus catálogos; no presupone que Alembic los repobló.
  const catalog = await get(page, "/finances/catalogs");
  const method =
    catalog.methods.find((m: { name: string }) => m.name === "Efectivo") ||
    (await post(page, "/finances/catalogs/methods", { name: "Efectivo" }));
  const category =
    catalog.categories.find(
      (c: { name: string }) => c.name === "Servicios básicos",
    ) ||
    (await post(page, "/finances/catalogs/categories", {
      name: "Servicios básicos",
    }));
  const rem = `/properties/${house.id}/reminders`,
    fin = `/properties/${house.id}/finances`;
  const today = (await get(page, rem)).today as string;
  const c = await post(page, "/contracts", {
    unit_id: unit.id,
    responsible_person_id: tenant.id,
    occupant_ids: [],
    owner_parties: [{ person_id: owner.id, share: 100 }],
    mode: capital ? "anticretico" : "monthly",
    status: "active",
    start_date: day(today, -40),
    end_date: day(today, 3),
    currency: "BOB",
    price: capital ? null : "1500",
    monthly_period: capital ? null : "calendar",
    first_period: capital ? null : "full",
    due_day: capital ? null : 5,
    payment_timing: "advance",
    services_included: false,
  });
  let oid: number | null = null;
  if (!capital) {
    const generated = await post(page, `${fin}/contracts/${c.id}/generate`, {
      request_key: key(),
      expected_version: c.version,
      through: c.start_date,
    });
    oid = generated.obligation_ids[0];
    await post(
      page,
      `${fin}/obligations/${oid}/adjust`,
      {
        request_key: key(),
        new_total: "1500",
        new_due_on: day(today, 3),
        reason: "Vencimiento ficticio pactado para la prueba",
      },
      200,
    );
  }
  return {
    owner,
    house,
    unit,
    second,
    tenant,
    method,
    category,
    rem,
    fin,
    today,
    c,
    oid,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function pay(page: Page, f: Fixture, amount: string, oid = f.oid) {
  return post(page, `${f.fin}/receive`, {
    request_key: key(),
    person_id: f.tenant.id,
    amount,
    currency: "BOB",
    occurred_on: f.today,
    method_id: f.method.id,
    payer_id: f.tenant.id,
    applications: [{ obligation_id: oid, amount }],
  });
}
async function enter(page: Page, f: Fixture) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Recordatorios", exact: true })
    .click();
  await page
    .getByLabel("Casa de los recordatorios")
    .selectOption(String(f.house.id));
  await expect(
    page.getByRole("heading", { name: "Resumen de atención" }),
  ).toBeVisible();
}
async function detail(page: Page, f: Fixture, k = `debt:${f.oid}`) {
  await page
    .getByTestId(k)
    .getByRole("button", { name: /Ver detalle/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Consultar registro de origen" }),
  ).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  mkdirSync("../docs/screenshots/phase-6", { recursive: true });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  if (process.env.CAPTURE_PHASE6_SCREENSHOTS === "1")
    await page.screenshot({
      path: `../docs/screenshots/phase-6/${info.project.name}-${name}.png`,
      fullPage: true,
    });
}
async function grant(
  page: Page,
  f: Fixture,
  purpose = "payments",
  personId = f.tenant.id,
  number = "+59171234567",
) {
  return post(page, `${f.rem}/consents`, {
    request_key: key(),
    expected_version: 0,
    person_id: personId,
    purpose,
    number,
    accepted_on: f.today,
    method: "Aceptación expresa ficticia de pruebas",
    explicitly_accepted: true,
  });
}
async function prepare(page: Page) {
  await page
    .getByRole("button", { name: "Preparar WhatsApp", exact: true })
    .click();
  await expect(page.getByLabel("Mensaje para revisar y editar")).toBeVisible();
  await page.getByRole("button", { name: "Guardar mensaje preparado" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mensaje preparado." }),
  ).toBeVisible();
}

test("saldo parcial, vencimientos y atención no crean otra deuda", async ({
  page,
}, info) => {
  const f = await setup(page);
  await pay(page, f, "1000");
  await enter(page, f);
  await expect(page.getByTestId(`debt:${f.oid}`)).toContainText("500,00");
  await capture(page, info, "resumen");
  await page.getByRole("button", { name: "Por vencer", exact: true }).click();
  await capture(page, info, "vencimientos");
  await page.getByRole("button", { name: "Alquileres", exact: true }).click();
  await capture(page, info, "alquileres");
  await detail(page, f);
  await page
    .getByRole("button", { name: "Guardar mi revisión del aviso" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Acción guardada" }),
  ).toBeVisible();
  await expect(page.getByText("Alquiler ·", { exact: false })).toContainText(
    "Revisado",
  );
  await page.getByLabel("Acción sobre este aviso").selectOption("snoozed");
  await page.getByLabel("Volver a atender el aviso el").fill(day(f.today, 1));
  await page
    .getByRole("button", { name: "Guardar mi revisión del aviso" })
    .click();
  await expect(page.getByText(/Atención pospuesta hasta/)).toBeVisible();
  const finance = await get(page, f.fin);
  expect(finance.obligations).toHaveLength(1);
  expect(finance.obligations[0].pending).toBe("500.00");
  expect(finance.movements).toHaveLength(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Recordatorios", exact: true })
    .click();
  await page
    .getByLabel("Casa de los recordatorios")
    .selectOption(String(f.house.id));
  expect(
    (await get(page, f.rem)).items.filter(
      (e: { key: string }) => e.key === `debt:${f.oid}`,
    ),
  ).toHaveLength(1);
});

test("consentimiento expreso, edición, apertura, envío manual y corrección conservan historia", async ({
  page,
}, info) => {
  const f = await setup(page);
  await pay(page, f, "1000");
  await enter(page, f);
  await detail(page, f);
  await page
    .getByRole("button", { name: "Preparar WhatsApp", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("consentimiento");
  await page
    .getByRole("button", { name: "Revisar consentimiento y número" })
    .click();
  const acceptance = page.getByRole("checkbox", {
    name: /Confirmo que la persona aceptó/,
  });
  await expect(acceptance).not.toBeChecked();
  await page
    .getByLabel("Cómo se obtuvo la aceptación")
    .fill("Aceptación ficticia por escrito para pruebas");
  await acceptance.check();
  await page
    .getByRole("button", { name: "Revisar y registrar consentimiento" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Consentimiento registrado" }),
  ).toBeVisible();
  await capture(page, info, "consentimientos");
  await page
    .getByRole("button", { name: "Volver al aviso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preparar WhatsApp", exact: true })
    .click();
  const text = page.getByLabel("Mensaje para revisar y editar");
  await expect(text).toHaveValue(/500,00/);
  await text.fill(
    (await text.inputValue()) + "\n¿Podría revisarlo? áéíóú & + #",
  );
  await page.getByRole("button", { name: "Guardar mensaje preparado" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mensaje preparado." }),
  ).toBeVisible();
  await capture(page, info, "preparar-whatsapp");
  let attempts = 0;
  await page.context().route("https://wa.me/**", async (route) => {
    attempts++;
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<p>Enlace interceptado de prueba. No se contactó WhatsApp.</p>",
    });
  });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Abrir WhatsApp", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^https:\/\/wa\.me\/59171234567\?text=/);
  await expect(
    page.getByRole("status").filter({ hasText: "Apertura registrada." }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  let messages = await get(page, `${f.rem}/communications`);
  expect(messages).toHaveLength(1);
  expect(messages[0].state).toBe("opened");
  await popup.close();
  await page.getByRole("button", { name: "Confirmar que yo lo envié" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Envío confirmado manualmente." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Historial de comunicaciones", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Ver comunicación ${messages[0].id}` })
    .click();
  await page
    .getByRole("button", { name: "Corregir confirmación anterior" })
    .click();
  await page
    .getByLabel("Motivo de la corrección")
    .fill("Confirmación ficticia equivocada; el mensaje no se envió");
  await page
    .getByRole("button", { name: "Registrar corrección con historial" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Corrección registrada." }),
  ).toBeVisible();
  await capture(page, info, "historial");
  const message = await get(page, `${f.rem}/communications/${messages[0].id}`);
  expect(message.state).toBe("not_sent");
  expect(message.events.map((e: { kind: string }) => e.kind)).toEqual([
    "opened",
    "manual_sent",
    "correct_not_sent",
  ]);
  await page
    .getByRole("button", { name: "Consentimientos", exact: true })
    .click();
  await page.getByRole("button", { name: /Revocar/ }).click();
  await page
    .getByLabel("Motivo de revocación")
    .fill("Retiro expreso ficticio de la autorización");
  await page.getByRole("button", { name: /Confirmar revocación/ }).click();
  await expect(page.getByText("Revocado", { exact: true })).toBeVisible();
  expect((await get(page, f.fin)).obligations[0].pending).toBe("500.00");
});

test("un cambio de saldo bloquea el texto viejo y permite prepararlo otra vez", async ({
  page,
}) => {
  const f = await setup(page);
  await pay(page, f, "1000");
  await grant(page, f);
  await enter(page, f);
  await detail(page, f);
  await prepare(page);
  await pay(page, f, "200");
  await page
    .getByRole("button", { name: "Abrir WhatsApp", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("cambió");
  expect((await get(page, `${f.rem}/communications`))[0].state).toBe(
    "prepared",
  );
  await page.getByRole("button", { name: "Generar texto actualizado" }).click();
  await expect(page.getByLabel("Mensaje para revisar y editar")).toHaveValue(
    /300,00/,
  );
  await page.getByRole("button", { name: "Guardar mensaje preparado" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mensaje preparado." }),
  ).toBeVisible();
  const list = await get(page, `${f.rem}/communications`);
  expect(list).toHaveLength(2);
  const all = await Promise.all(
    list.map((m: { id: number }) =>
      get(page, `${f.rem}/communications/${m.id}`),
    ),
  );
  expect(all.some((m) => m.final_text.includes("500,00"))).toBe(true);
  expect(all.some((m) => m.final_text.includes("300,00"))).toBe(true);
});

test("servicios: obligación, pago al proveedor y recuperación parcial se distinguen", async ({
  page,
}, info) => {
  const f = await setup(page);
  const type = await post(page, "/utility-types", {
    name: `Electricidad avisos ${key().slice(0, 8)}`,
  });
  const account = await post(
    page,
    `/properties/${f.house.id}/service-accounts`,
    {
      type_id: type.id,
      label: "Electricidad compartida",
      provider: "Proveedor ficticio",
      measurement_kind: "shared",
      measure_unit: "kWh",
      start_date: day(f.today, -60),
      configuration: {
        method: "equal",
        unit_ids: [f.unit.id, f.second.id],
        owner_person_id: f.owner.id,
        provider_payer_id: f.owner.id,
        reimbursement_person_id: f.owner.id,
      },
    },
  );
  const receipt = await post(page, `/service-accounts/${account.id}/receipts`, {
    external_reference: "REC-PRUEBA",
    amount: "240",
    currency: "BOB",
    issued_on: f.today,
    period_start: day(f.today, -29),
    period_end: f.today,
    due_on: day(f.today, 2),
  });
  const distribution = await post(
    page,
    `/utility-receipts/${receipt.id}/calculate`,
    { expected_version: receipt.version, request_key: key() },
  );
  await post(
    page,
    `/utility-distributions/${distribution.id}/confirm`,
    {
      expected_version: distribution.version,
      expected_receipt_version: distribution.receipt_version,
    },
    200,
  );
  const imported = await post(page, `${f.fin}/receipts/${receipt.id}/import`, {
    request_key: key(),
    expected_distribution_id: distribution.id,
    owner_person_id: f.owner.id,
  });
  const expense = (await get(page, f.fin)).expenses.find(
    (e: { receipt_id: number }) => e.receipt_id === receipt.id,
  );
  await post(page, `${f.fin}/expenses/${expense.id}/pay`, {
    request_key: key(),
    amount: "180",
    currency: "BOB",
    occurred_on: f.today,
    method_id: f.method.id,
    payer_id: f.owner.id,
  });
  await pay(page, f, "50", imported.obligation_ids[0]);
  await enter(page, f);
  await page.getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(
    page.getByTestId(`debt:${imported.obligation_ids[0]}`),
  ).toContainText("70,00");
  await capture(page, info, "servicios");
  await page
    .getByRole("button", { name: "Avisos de propietarios", exact: true })
    .click();
  await expect(page.getByTestId(`receipt:${receipt.id}`)).toContainText(
    "60,00",
  );
  await detail(page, f, `receipt:${receipt.id}`);
  await expect(page.getByText(/Dinero efectivamente pagado/)).toContainText(
    "180,00",
  );
  await capture(page, info, "propietarios");
  const events = (await get(page, f.rem)).items;
  expect(
    events.some((e: { key: string }) => e.key === `expense:${expense.id}`),
  ).toBe(false);
});

test("reportar un pago no mueve dinero; verificar vincula el ingreso existente", async ({
  page,
}, info) => {
  const f = await setup(page);
  await pay(page, f, "1000");
  await enter(page, f);
  await page
    .getByRole("button", { name: "Pagos pendientes de verificar", exact: true })
    .click();
  await page.getByRole("button", { name: "Registrar pago reportado" }).click();
  await page
    .getByLabel("Obligación relacionada con el reporte")
    .selectOption(String(f.oid));
  await page
    .getByLabel("Persona que informa haber pagado")
    .selectOption(String(f.tenant.id));
  await page
    .getByLabel("Concepto informado")
    .fill("Alquiler comunicado para revisión");
  await page.getByLabel("Importe reportado, todavía sin confirmar").fill("500");
  await page
    .getByLabel("Método de pago informado")
    .selectOption(String(f.method.id));
  await page
    .getByLabel("Referencia del comprobante reportado")
    .fill("Comprobante ficticio de pruebas");
  await page.getByRole("button", { name: "Guardar reporte pendiente" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reporte guardado" }),
  ).toBeVisible();
  expect((await get(page, f.fin)).obligations[0].pending).toBe("500.00");
  await capture(page, info, "pagos-reportados");
  const report = (await get(page, `${f.rem}/payment-reports`))[0];
  const move = await pay(page, f, "500");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page
    .getByRole("button", { name: "Pagos pendientes de verificar", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Revisar reporte ${report.id}` })
    .click();
  await page
    .getByLabel("Ingreso real que corresponde al comprobante")
    .selectOption(String(move.movement_id));
  await page
    .getByLabel("Motivo de la decisión")
    .fill("Coincide con el comprobante y aplicación real");
  await page
    .getByRole("button", { name: "Revisar y confirmar decisión" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Decisión registrada" }),
  ).toBeVisible();
  expect((await get(page, `${f.rem}/payment-reports`))[0].state).toBe(
    "verified",
  );
  const finance = await get(page, f.fin);
  expect(finance.movements).toHaveLength(2);
  expect(finance.summary[0].received).toBe("1500.00");
  expect(finance.obligations[0].pending).toBe("0.00");
});

test("capital pendiente sigue visible después de finalizar la ocupación y desaparece al liquidar", async ({
  page,
}, info) => {
  const f = await setup(page, true),
    cap = `/properties/${f.house.id}/anticreticos/${f.c.id}`;
  await post(page, `${cap}/conditions`, {
    request_key: key(),
    expected_version: 0,
    expected_contract_version: f.c.version,
    agreed_capital: "70000",
    expected_delivery_on: day(f.today, -30),
    restitution_on: day(f.today, 3),
    allow_early_return: true,
    conditions: "Acuerdo ficticio sujeto a revisión del propietario",
    document_reference: "Documento ficticio de pruebas",
    holders: [
      {
        person_id: f.tenant.id,
        beneficiary_person_id: f.tenant.id,
        assigned_amount: "70000",
      },
    ],
    responsibles: [{ person_id: f.owner.id, assigned_amount: "70000" }],
  });
  async function capitalCash(amount: string, returned = false) {
    const d = await get(page, cap);
    return post(page, `${cap}/${returned ? "returns" : "deliveries"}`, {
      request_key: key(),
      expected_version: d.version,
      expected_contract_version: d.contract.version,
      amount,
      currency: "BOB",
      occurred_on: f.today,
      method_id: f.method.id,
      payer_id: returned ? f.owner.id : f.tenant.id,
      beneficiary_person_id: returned ? f.tenant.id : f.owner.id,
      allocations: [
        { holder_id: f.tenant.id, responsible_id: f.owner.id, amount },
      ],
    });
  }
  await capitalCash("50000");
  await capitalCash("15000", true);
  await post(
    page,
    `/contracts/${f.c.id}/actions`,
    {
      action: "finish",
      end_date: day(f.today, -1),
      reason: "Final de ocupación; capital todavía pendiente",
    },
    200,
  );
  await enter(page, f);
  await page
    .getByRole("button", { name: "Anticréticos", exact: true })
    .last()
    .click();
  const k = `capital:${f.c.id}:${f.tenant.id}:${f.owner.id}`;
  await expect(page.getByTestId(k)).toContainText("35.000,00");
  await detail(page, f, k);
  await expect(page.getByText(/Titular del capital/)).toContainText(
    f.tenant.full_name,
  );
  await capture(page, info, "anticreticos");
  await page
    .getByRole("button", { name: "Guardar mi revisión del aviso" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Acción guardada" }),
  ).toBeVisible();
  await capitalCash("35000", true);
  await page.getByRole("button", { name: "Actualizar recordatorios" }).click();
  await expect(
    page.getByText("Asignación de capital liquidada."),
  ).toBeVisible();
  const summary = (await get(page, f.fin)).summary[0];
  expect(summary.received).toBe("0.00");
  expect(summary.capital_pending).toBe("0.00");
  expect(summary.capital_returned).toBe("50000.00");
});

test("preferencias, plantillas y contrato usan configuración de la casa", async ({
  page,
}, info) => {
  const f = await setup(page);
  await enter(page, f);
  await page.getByRole("button", { name: "Preferencias", exact: true }).click();
  await expect(page.getByLabel("Días previos al vencimiento")).toHaveValue(
    "7, 3, 1",
  );
  await page.getByLabel("Máximo de días para posponer").fill("2");
  await page
    .getByRole("button", { name: "Guardar preferencias de esta casa" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Preferencias guardadas/ }),
  ).toBeVisible();
  await capture(page, info, "preferencias");
  await page
    .getByLabel("Nombre de la plantilla")
    .fill("Alquiler cordial de la casa");
  await page
    .getByLabel("Texto de la plantilla")
    .fill(
      "Buen día, {nombre}. Saldo {moneda} {importe} por {concepto}, hasta {vencimiento}.",
    );
  await page
    .getByRole("checkbox", { name: /Usar esta plantilla personalizada/ })
    .check();
  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Plantilla guardada/ }),
  ).toBeVisible();
  await grant(page, f);
  const draft = await get(
    page,
    `${f.rem}/notices/debt:${f.oid}/proposal?recipient_id=${f.tenant.id}`,
  );
  expect(draft.text).toContain("Saldo BOB 1.500,00");
  await page
    .getByRole("button", { name: "Contratos", exact: true })
    .last()
    .click();
  await capture(page, info, "contratos");
  await detail(page, f, `contract:${f.c.id}`);
  await page
    .getByRole("button", { name: "Consultar registro de origen" })
    .click();
  await expect(
    page.getByRole("heading", { name: f.house.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`CONTRATO N.º ${f.c.id}`, { exact: true }),
  ).toBeVisible();
});

test("operador y propietario respetan permisos sin confirmar envíos ajenos ni verificar dinero", async ({
  page,
}) => {
  const f = await setup(page);
  await grant(page, f);
  const draft = await get(
    page,
    `${f.rem}/notices/debt:${f.oid}/proposal?recipient_id=${f.tenant.id}`,
  );
  const e = draft.event;
  const msg = await post(page, `${f.rem}/notices/debt:${f.oid}/messages`, {
    request_key: key(),
    expected_version: 0,
    expected_fingerprint: e.source_fingerprint,
    expected_proposal_fingerprint: draft.proposal_fingerprint,
    recipient_id: f.tenant.id,
  });
  const report = await post(page, `${f.rem}/payment-reports`, {
    request_key: key(),
    obligation_id: f.oid,
    reporting_person_id: f.tenant.id,
    concept: "Alquiler reportado de prueba",
    amount: "500",
    reported_on: f.today,
    method_id: f.method.id,
    document_reference: "Referencia ficticia",
  });
  const operator = await post(page, "/users", {
    username: `operador_${key().slice(0, 12)}`,
    full_name: "Operador ficticio",
    password: credentials().password,
    role: "operator",
    property_ids: [f.house.id],
  });
  const owner = await post(page, "/users", {
    username: `duena_${key().slice(0, 12)}`,
    person_id: f.owner.id,
    password: credentials().password,
    role: "owner",
    property_ids: [],
  });
  await post(
    page,
    "/auth/login",
    { username: operator.username, password: credentials().password },
    200,
  );
  await enter(page, f);
  await detail(page, f);
  await expect(
    page.getByRole("button", { name: "Preparar WhatsApp", exact: true }),
  ).toBeVisible();
  let response = await page.request.post(
    `${apiBase}/api/v1${f.rem}/communications/${msg.communication_id}/actions`,
    {
      data: { request_key: key(), expected_version: 1, action: "manual_sent" },
    },
  );
  expect(response.status()).toBe(403);
  response = await page.request.post(
    `${apiBase}/api/v1${f.rem}/payment-reports/${report.report_id}/decisions`,
    {
      data: {
        request_key: key(),
        expected_version: 1,
        action: "rejected",
        reason: "El operador no verifica dinero",
      },
    },
  );
  expect(response.status()).toBe(403);
  await page.getByRole("button", { name: "Preferencias", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar preferencias de esta casa" }),
  ).toHaveCount(0);
  await post(
    page,
    "/auth/login",
    { username: owner.username, password: credentials().password },
    200,
  );
  await enter(page, f);
  await detail(page, f);
  await expect(
    page.getByRole("button", { name: "Preparar WhatsApp", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar mi revisión del aviso" }),
  ).toBeVisible();
  response = await page.request.get(
    `${apiBase}/api/v1/properties/2147483647/reminders`,
  );
  expect(response.status()).toBe(404);
});

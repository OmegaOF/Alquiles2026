import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { FinanceForm } from "../src/pages/finances/Forms";
import { Finances } from "../src/pages/Finances";
import { exactCents, exactAmount } from "../src/finances";
import type { FinanceData, Obligation } from "../src/finances";
import type { Person, Property, User } from "../src/types";

const owner: Person = {
  id: 1,
  full_name: "Ana Propietaria",
  is_owner: true,
  document: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
};
const tenant: Person = {
  ...owner,
  id: 2,
  full_name: "Luis Inquilino",
  is_owner: false,
};
const property: Property = {
  id: 10,
  name: "Casa Jardín",
  address: "Calle de prueba",
  city: "La Paz",
  zone: null,
  description: null,
  is_active: true,
  owners: [{ person_id: 1, share: 100 }],
  manager_ids: [],
};
const user: User = {
  id: 1,
  username: "ana",
  full_name: owner.full_name,
  role: "general_admin",
  person_id: 1,
  display_name: null,
  is_active: true,
  property_ids: [],
};
const obligation: Obligation = {
  id: 20,
  person_id: 2,
  unit_id: 11,
  contract_id: 30,
  receipt_id: null,
  service_origin_id: null,
  currency: "BOB",
  concept: "Alquiler",
  period_start: "2031-01-01",
  period_end: "2031-01-31",
  effective_period_end: "2031-01-31",
  effective_due_on: "2031-01-05",
  original_amount: "500.00",
  adjustments: "0.00",
  total: "500.00",
  applied: "0.00",
  credit_applied: "0.00",
  pending: "500.00",
  state: "pending",
  applications: [],
};
const data: FinanceData = {
  obligations: [obligation],
  movements: [],
  expenses: [],
  summary: [
    {
      currency: "BOB",
      receivable: "500.00",
      pending: "500.00",
      received: "0.00",
      disbursed: "0.00",
    },
  ],
  history: [],
};
const catalogs = {
  methods: [{ id: 1, name: "Efectivo", is_active: true }],
  categories: [{ id: 1, name: "Mantenimiento", is_active: true }],
};
const props = {
  base: "/properties/10/finances",
  data,
  catalogs,
  people: [owner, tenant],
  units: [],
  contracts: [],
  receipts: [],
  admin: true,
  onSaved: vi.fn(async () => {}),
  onCancel: vi.fn(),
};
afterEach(() => vi.restoreAllMocks());

test("centavos exactos no convierten dinero a punto flotante", () => {
  expect(exactAmount(exactCents("999999999999.99") - exactCents("0.01"))).toBe(
    "999999999999.98",
  );
  expect(exactAmount(exactCents("600") - exactCents("500"))).toBe("100.00");
  expect(exactAmount(exactCents("-0.01"))).toBe("-0.01");
});

test("pago guiado conserva pagador distinto y aplicaciones explícitas sin reparto automático", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ operation_id: 1, movement_id: 40 }), {
        status: 201,
      }),
    );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <FinanceForm {...props} action={{ kind: "receive" }} initialPersonId={2} />,
  );
  const u = userEvent.setup();
  expect(screen.getByLabelText("Aplicar a Alquiler n.º 20")).toHaveValue(null);
  await u.type(
    screen.getByLabelText("Importe del dinero realmente entregado"),
    "600",
  );
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Método de pago" }),
    "1",
  );
  await u.selectOptions(
    screen.getByRole("combobox", {
      name: "Persona que entrega o paga el dinero",
    }),
    "1",
  );
  await u.type(screen.getByLabelText("Aplicar a Alquiler n.º 20"), "500");
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Si queda dinero sin aplicar" }),
    "credit",
  );
  await u.click(
    screen.getByRole("button", { name: "Revisar y confirmar registro" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(body.person_id).toBe(2);
  expect(body.payer_id).toBe(1);
  expect(body.amount).toBe("600");
  expect(body.surplus).toBe("credit");
  expect(body.applications).toEqual([{ obligation_id: 20, amount: "500" }]);
  expect(body).not.toHaveProperty("tax");
});

test("un reintento de formulario conserva el identificador de la operación", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ detail: "Error temporal" }), {
          status: 409,
        }),
    );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <FinanceForm {...props} action={{ kind: "receive" }} initialPersonId={2} />,
  );
  const u = userEvent.setup();
  await u.type(
    screen.getByLabelText("Importe del dinero realmente entregado"),
    "50",
  );
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Método de pago" }),
    "1",
  );
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Si queda dinero sin aplicar" }),
    "advance",
  );
  await u.click(
    screen.getByRole("button", { name: "Revisar y confirmar registro" }),
  );
  await screen.findByRole("alert");
  await u.click(
    screen.getByRole("button", { name: "Revisar y confirmar registro" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).request_key).toBe(
    JSON.parse(String(fetch.mock.calls[1][1]?.body)).request_key,
  );
});

test("registrar gasto separa el registro del desembolso", () => {
  render(<FinanceForm {...props} action={{ kind: "expense" }} />);
  expect(
    screen.getByLabelText("Importe del gasto registrado"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Método de pago")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Registrar el gasto no significa que el dinero ya salió/),
  ).toBeInTheDocument();
});

test("propietario consulta resumen y deudas sin controles de gestión", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    const value = path.endsWith("/finances")
      ? data
      : path.includes("/catalogs")
        ? catalogs
        : path.endsWith("/contacts")
          ? [owner, tenant]
          : [];
    return new Response(JSON.stringify(value), { status: 200 });
  });
  render(
    <Finances
      user={{ ...user, role: "owner" }}
      properties={[property]}
      people={[owner, tenant]}
    />,
  );
  await screen.findByRole("heading", { name: "Moneda BOB" });
  await userEvent.click(screen.getByRole("button", { name: "Por cobrar" }));
  expect(
    await screen.findByText("Alquiler · Luis Inquilino"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Generar alquileres" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Ajustar importe 20" }),
  ).not.toBeInTheDocument();
});

test("resumen mantiene distintas monedas separadas", async () => {
  const two = {
    ...data,
    summary: [
      ...data.summary,
      {
        currency: "USD",
        receivable: "100.00",
        pending: "100.00",
        received: "0.00",
      },
    ],
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/finances")
            ? two
            : String(url).includes("/catalogs")
              ? catalogs
              : [],
        ),
        { status: 200 },
      ),
  );
  render(
    <Finances user={user} properties={[property]} people={[owner, tenant]} />,
  );
  expect(
    await screen.findByRole("heading", { name: "Moneda BOB" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Moneda USD" }),
  ).toBeInTheDocument();
});

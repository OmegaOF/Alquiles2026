import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ConditionsForm } from "../src/pages/anticreticos/ConditionsForm";
import { CapitalForm } from "../src/pages/anticreticos/CapitalForm";
import { Anticreticos } from "../src/pages/Anticreticos";
import type { CapitalBook, CapitalData } from "../src/anticreticos";
import type { Person, Property, User } from "../src/types";

const people: Person[] = [
  { id: 1, full_name: "Ana Propietaria", is_owner: true },
  { id: 2, full_name: "Luis Titular", is_owner: false },
  { id: 3, full_name: "Elena Pagadora", is_owner: false },
].map((p) => ({
  document: null,
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  notes: null,
  ...p,
}));
const property: Property = {
  id: 10,
  name: "Casa Jardín",
  address: "Calle Uno",
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
  full_name: people[0].full_name,
  role: "general_admin",
  person_id: 1,
  display_name: null,
  is_active: true,
  property_ids: [],
};
const book: CapitalBook = {
  contract: {
    id: 30,
    property_id: 10,
    unit_id: null,
    resolved_property_id: 10,
    target_label: "Casa completa",
    responsible_person_id: 2,
    occupant_ids: [2],
    owners: [{ person_id: 1, share: "100.00" }],
    source_reservation_id: null,
    status: "active",
    mode: "anticretico",
    start_date: "2031-01-01",
    end_date: "2032-01-31",
    actual_end_date: null,
    price: null,
    currency: "BOB",
    daily_count: null,
    weekly_partial_allowed: null,
    monthly_period: null,
    first_period: null,
    due_day: null,
    payment_timing: "advance",
    due_terms: null,
    services_included: false,
    service_terms: null,
    conditions: null,
    notes: null,
    allows_service_charges: true,
    version: 2,
    periods: {
      occupancy_days: 396,
      contracted_days: 396,
      billable_days: null,
      full_weeks: null,
      partial_days: null,
      monthly_periods: [],
    },
  },
  version: 4,
  currency: "BOB",
  state: "partial_receipt",
  review_issues: [],
  capital_agreed: "70000.00",
  capital_received: "50000.00",
  capital_to_receive: "20000.00",
  capital_returned: "0.00",
  capital_adjustments: "0.00",
  capital_pending: "50000.00",
  received_above_agreed: "0.00",
  conditions: {
    id: 40,
    revision: 1,
    agreed_capital: "70000.00",
    expected_delivery_on: "2031-01-01",
    restitution_on: "2032-02-01",
    allow_early_return: true,
    conditions: "Condiciones documentadas",
    document_reference: "Documento externo",
    notes: null,
    holders: [
      { person_id: 2, beneficiary_person_id: 2, assigned_amount: "70000.00" },
    ],
    responsibles: [{ person_id: 1, assigned_amount: "70000.00" }],
    created_by: 1,
    created_at: "2031-01-01T12:00:00",
    reason: null,
  },
  holders: [
    {
      person_id: 2,
      beneficiary_person_id: 2,
      assigned_amount: "70000.00",
      pending: "50000.00",
    },
  ],
  responsibles: [
    { person_id: 1, assigned_amount: "70000.00", pending: "50000.00" },
  ],
  balances: [
    {
      holder_id: 2,
      responsible_id: 1,
      received: "50000.00",
      returned: "0.00",
      adjustments: "0.00",
      pending: "50000.00",
    },
  ],
  movements: [],
  adjustments: [],
  history: [],
  service_obligations: [],
};
const common = {
  book,
  people,
  base: "/properties/10/anticreticos/30",
  onSaved: vi.fn(async () => {}),
  onCancel: vi.fn(),
};
const cashProps = {
  ...common,
  methods: [{ id: 1, name: "Efectivo", is_active: true }],
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("un contrato anterior no inventa capital, fechas ni repartos desde los propietarios", () => {
  render(
    <ConditionsForm
      {...common}
      book={{ ...book, conditions: null, version: 0, capital_received: "0.00" }}
    />,
  );
  expect(screen.getByLabelText("Capital total acordado")).toHaveValue(null);
  expect(screen.getByLabelText("Titular 1")).toHaveValue("");
  expect(screen.getByLabelText("Responsable 1")).toHaveValue("");
  expect(screen.getByLabelText("Fecha pactada de restitución")).toHaveValue("");
  expect(screen.getAllByText(/No se usan las participaciones/)).toHaveLength(2);
});

test("capital acordado guarda solo condiciones y asignaciones expresas, con ambas versiones", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 201 }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ConditionsForm {...common} />);
  fireEvent.change(screen.getByLabelText("Motivo de la modificación"), {
    target: { value: "Se confirma acuerdo existente" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar y guardar condiciones" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(String(fetcher.mock.calls[0][0])).toContain("/conditions");
  expect(body).toMatchObject({
    expected_version: 4,
    expected_contract_version: 2,
    agreed_capital: "70000.00",
    holders: [
      { person_id: 2, beneficiary_person_id: 2, assigned_amount: "70000.00" },
    ],
    responsibles: [{ person_id: 1, assigned_amount: "70000.00" }],
  });
  expect(body).not.toHaveProperty("amount");
});

function fillCash() {
  fireEvent.change(
    screen.getByLabelText("Importe de capital que se devuelve"),
    { target: { value: "10000.01" } },
  );
  fireEvent.change(screen.getByLabelText("Método de entrega o devolución"), {
    target: { value: "1" },
  });
  fireEvent.change(
    screen.getByLabelText("Persona que efectivamente entrega o paga"),
    { target: { value: "3" } },
  );
  fireEvent.change(
    screen.getByLabelText("Persona que efectivamente recibe el dinero"),
    { target: { value: "2" } },
  );
  fireEvent.change(screen.getByLabelText("Importe de la parte 1"), {
    target: { value: "10000.01" },
  });
}

test("devolución muestra antes y después exactos, titular, pagador y beneficiario antes de confirmar", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 201 }));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<CapitalForm {...cashProps} kind="return" />);
  fillCash();
  const review = screen.getByRole("region", { name: "Revisión del capital" });
  expect(within(review).getByText(/39.999,99/)).toBeInTheDocument();
  expect(
    within(review).getByText(/Elena Pagadora entrega\/paga a Luis Titular/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento real" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(confirm.mock.calls[0][0]).toContain("39.999,99");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
    amount: "10000.01",
    payer_id: 3,
    beneficiary_person_id: 2,
    currency: "BOB",
    allocations: [{ holder_id: 2, responsible_id: 1, amount: "10000.01" }],
  });
});

test("cancelar la confirmación no registra una devolución", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<CapitalForm {...cashProps} kind="return" />);
  fillCash();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento real" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});

test("el reintento tras conflicto conserva la misma clave y muestra el mensaje del servidor", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ detail: "El saldo cambió; actualiza los datos." }),
          { status: 409 },
        ),
    );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<CapitalForm {...cashProps} kind="return" />);
  fillCash();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento real" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("El saldo cambió");
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento real" }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).request_key).toBe(
    JSON.parse(String(fetcher.mock.calls[1][1]?.body)).request_key,
  );
});

function setupPage(role: User["role"], books: CapitalBook[] = [book]) {
  const data: CapitalData = {
    items: books,
    today: "2031-01-01",
    summary: books.map((b) => ({
      currency: b.currency,
      count: 1,
      pending_conditions: 0,
      capital_agreed: b.capital_agreed,
      capital_received: b.capital_received,
      capital_to_receive: b.capital_to_receive,
      capital_returned: b.capital_returned,
      capital_adjustments: b.capital_adjustments,
      capital_pending: b.capital_pending,
    })),
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    const value = path.endsWith("/anticreticos")
      ? data
      : path.endsWith("/catalogs")
        ? { methods: cashProps.methods, categories: [] }
        : path.endsWith("/contacts")
          ? people
          : [];
    return new Response(JSON.stringify(value), { status: 200 });
  });
  render(
    <Anticreticos
      user={{ ...user, role }}
      properties={[property]}
      people={people}
    />,
  );
}

test("propietario consulta capital sin botones para modificar, devolver ni anular", async () => {
  setupPage("owner");
  await userEvent.click(
    await screen.findByRole("button", { name: "Ver capital del contrato 30" }),
  );
  expect(
    screen.getByRole("heading", { name: "Capital acordado y dinero real" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: /Registrar devolución|Registrar entrega|Modificar condiciones|Anular/,
    }),
  ).not.toBeInTheDocument();
});

test("operador puede abrir entrega pero no devolución ni ajustes sensibles", async () => {
  setupPage("operator");
  await userEvent.click(
    await screen.findByRole("button", { name: "Ver capital del contrato 30" }),
  );
  expect(
    screen.getByRole("button", { name: "Registrar entrega de capital" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: /Registrar devolución|Registrar acuerdo|Modificar condiciones/,
    }),
  ).not.toBeInTheDocument();
});

test("resumen separa monedas y vencimientos son una consulta sin mensajes", async () => {
  setupPage("general_admin", [
    book,
    {
      ...book,
      currency: "USD",
      contract: { ...book.contract, id: 31, currency: "USD" },
    },
  ]);
  await screen.findByRole("button", { name: "Ver capital del contrato 30" });
  await userEvent.click(
    screen.getByRole("button", { name: "Resumen del capital" }),
  );
  expect(screen.getByRole("heading", { name: "Capital en BOB" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Capital en USD" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Vencimientos" }));
  expect(screen.getByText(/Esta pantalla consulta fechas/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /WhatsApp|Enviar/ }),
  ).not.toBeInTheDocument();
});

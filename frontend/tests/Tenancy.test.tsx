import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Tenancy } from "../src/pages/Tenancy";
import { OccupancyScreen } from "../src/pages/tenancy/Screens";
import type { Person, Property, User } from "../src/types";
import type { Contract } from "../src/tenancy";

const people: Person[] = [
  { id: 1, full_name: "Ana Propietaria", is_owner: true },
  { id: 2, full_name: "Luis Responsable", is_owner: false },
  { id: 3, full_name: "Elena Ocupante", is_owner: false },
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
  id: 1,
  name: "Casa Jardín",
  address: "Calle Uno",
  city: "La Paz",
  zone: null,
  description: null,
  is_active: true,
  owners: [{ person_id: 1, share: "100.00" }],
  manager_ids: [],
};
const account: User = {
  id: 1,
  username: "ana",
  full_name: people[0].full_name,
  role: "general_admin",
  person_id: 1,
  display_name: null,
  is_active: true,
  property_ids: [],
};
const unit = {
  id: 11,
  code: "A",
  name: "Cuarto con patio",
  is_enabled: true,
  maintenance: false,
};
const available = {
  property_id: 1,
  property_name: property.name,
  start_date: "2031-01-01",
  end_date: "2031-01-03",
  whole: {
    unit_id: null,
    label: "Casa completa",
    state: "available",
    reason: "Sin contratos ni reservas en estas fechas.",
    blockers: [],
  },
  units: [
    {
      unit_id: unit.id,
      label: unit.name,
      state: "available",
      reason: "Sin contratos ni reservas en estas fechas.",
      blockers: [],
    },
  ],
};
function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(
  role: User["role"] = "general_admin",
  view: "contracts" | "availability" = "contracts",
) {
  let saved: Contract | null = null;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("/api/v1", "");
    if (path === "/contracts" && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      saved = {
        ...body,
        id: 40,
        resolved_property_id: 1,
        target_label: unit.name,
        owners: body.owner_parties,
        actual_end_date: null,
        source_reservation_id: null,
        version: 1,
        allows_service_charges: false,
        periods: {
          occupancy_days: 3,
          contracted_days: 3,
          billable_days: 3,
          full_weeks: null,
          partial_days: null,
          monthly_periods: [],
        },
      };
      return response(saved, 201);
    }
    if (path === "/contracts") return response(saved ? [saved] : []);
    if (path === "/contracts/40") return response(saved);
    if (path.endsWith("/history") || path === "/reservations")
      return response([]);
    if (path.endsWith("/units")) return response([unit]);
    if (path.endsWith("/contacts")) return response(people);
    if (path.includes("/availability")) return response(available);
    throw new Error(`Solicitud inesperada: ${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <Tenancy
      view={view}
      user={{ ...account, role }}
      properties={[property]}
      people={people}
      refreshPeople={async () => {}}
    />,
  );
  return fetcher;
}
async function next() {
  await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}
async function reachConditions(mode = "daily") {
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Registrar contrato",
    }),
  );
  expect(screen.getByText("PASO 1 DE 8")).toBeVisible();
  await next();
  await userEvent.selectOptions(
    await screen.findByLabelText("Espacio a alquilar"),
    String(unit.id),
  );
  await next();
  await userEvent.selectOptions(
    screen.getByLabelText("Modalidad de alquiler"),
    mode,
  );
  await next();
  await userEvent.selectOptions(
    screen.getByLabelText("Persona responsable del contrato"),
    "2",
  );
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Ocupantes adicionales (opcional)" }),
    ).getByLabelText("Elena Ocupante"),
  );
  await next();
  fireEvent.change(screen.getByLabelText("Fecha de entrada"), {
    target: { value: "2031-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Fecha de salida"), {
    target: { value: "2031-01-03" },
  });
  await next();
}
async function confirmWizard() {
  await next();
  expect(
    screen.getByRole("heading", { name: "Revisar el resumen" }),
  ).toBeVisible();
  await next();
  await userEvent.click(
    screen.getByLabelText("He revisado los datos y confirmo el contrato"),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar contrato" }),
  );
  await screen.findByText(/El contrato se guardó correctamente/);
}

test("historial descarta una respuesta tardía de la casa consultada anteriormente", async () => {
  let resolveFirst!: (data: unknown) => void;
  const first = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const row = (id: number) => ({
    id,
    resolved_property_id: id,
    target_label: "Casa completa",
    responsible_person_id: 2,
    occupant_ids: [],
    owners: [],
    status: "finished",
    start_date: "2030-01-01",
    end_date: "2030-01-03",
    actual_end_date: "2030-01-03",
    current: false,
    history: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/1/occupancy")) return response(await first);
      if (url.endsWith("/2/occupancy")) return response([row(2)]);
      return response([]);
    }),
  );
  render(
    <OccupancyScreen
      properties={[property, { ...property, id: 2, name: "Casa Segunda" }]}
      people={people}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Propiedad del historial"),
    "2",
  );
  await screen.findByRole("heading", { name: "Contrato 2 · Finalizado" });
  await act(async () => {
    resolveFirst([row(1)]);
    await first;
  });
  expect(
    screen.getByRole("heading", { name: "Contrato 2 · Finalizado" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Contrato 1 · Finalizado" }),
  ).not.toBeInTheDocument();
});

test("registro diario recorre ocho pasos y conserva servicios, personas y moneda sin generar pagos", async () => {
  const fetcher = setup();
  await reachConditions();
  const services = screen.getByLabelText("Servicios básicos incluidos");
  expect(services).toBeChecked();
  expect(services).toBeDisabled();
  await userEvent.type(
    screen.getByLabelText("Precio por día o noche acordado"),
    "50.25",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Estado al guardar"),
    "active",
  );
  await confirmWizard();
  const call = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/contracts") && init?.method === "POST",
  )!;
  const body = JSON.parse(call[1]!.body as string);
  expect(body).toMatchObject({
    unit_id: 11,
    property_id: null,
    responsible_person_id: 2,
    occupant_ids: [3],
    mode: "daily",
    daily_count: "inclusive",
    price: "50.25",
    currency: "BOB",
    services_included: true,
    status: "active",
  });
  expect(body).not.toHaveProperty("payments");
  expect(screen.getByText(/3 días cobrables/)).toBeVisible();
});

test("contrato mensual guarda el periodo, primer cobro y vencimiento elegidos", async () => {
  const fetcher = setup();
  await reachConditions("monthly");
  await userEvent.type(
    screen.getByLabelText("Precio mensual acordado"),
    "1400",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Periodo mensual"),
    "calendar",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Primer periodo"),
    "prorated",
  );
  fireEvent.change(screen.getByLabelText("Día de vencimiento mensual"), {
    target: { value: "31" },
  });
  await confirmWizard();
  const call = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/contracts") && init?.method === "POST",
  )!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    mode: "monthly",
    monthly_period: "calendar",
    first_period: "prorated",
    due_day: 31,
    price: "1400",
    daily_count: null,
  });
});

test("vencimiento mensual personalizado utiliza el acuerdo escrito sin imponer un día", async () => {
  const fetcher = setup();
  await reachConditions("monthly");
  await userEvent.type(
    screen.getByLabelText("Precio mensual acordado"),
    "1400",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Modalidad de cobro"),
    "custom",
  );
  expect(
    screen.queryByLabelText("Día de vencimiento mensual"),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText(
      "Vencimientos pactados (especificar si hay otro acuerdo)",
    ),
    "Primer lunes del periodo",
  );
  await confirmWizard();
  const call = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/contracts") && init?.method === "POST",
  )!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    payment_timing: "custom",
    due_terms: "Primer lunes del periodo",
    due_day: null,
  });
  expect(
    screen.getByText(/Vencimiento según el acuerdo escrito/),
  ).toBeVisible();
});

test("operador prepara borradores y no puede escoger un contrato vigente", async () => {
  setup("operator");
  await reachConditions();
  const status = screen.getByLabelText("Estado al guardar");
  expect(status).toBeDisabled();
  expect(status).toHaveValue("draft");
  expect(
    within(status).queryByRole("option", { name: /Vigente/ }),
  ).not.toBeInTheDocument();
});

test("propietario consulta contratos sin acciones de registro", async () => {
  setup("owner");
  await screen.findByText("Todavía no hay contratos para mostrar.");
  expect(
    screen.queryByRole("button", { name: "Registrar contrato" }),
  ).not.toBeInTheDocument();
});

test("disponibilidad identifica cada espacio con texto y permite consultar fechas", async () => {
  const fetcher = setup("owner", "availability");
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Casa completa" }),
    ).toBeVisible(),
  );
  expect(screen.getByText("Cuartos disponibles: 1 de 1.")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Consultar desde"), {
    target: { value: "2031-02-01" },
  });
  fireEvent.change(screen.getByLabelText("Consultar hasta"), {
    target: { value: "2031-02-28" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar disponibilidad" }),
  );
  expect(
    fetcher.mock.calls.some(([url]) =>
      url.endsWith("availability?start=2031-02-01&end=2031-02-28"),
    ),
  ).toBe(true);
});

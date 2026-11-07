import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReceiptForm } from "../src/pages/utilities/ReceiptForm";
import { ReceiptDetail } from "../src/pages/utilities/ReceiptDetail";
import { Services } from "../src/pages/utilities/Services";
import { ConfigurationFields } from "../src/pages/utilities/ConfigurationFields";
import { money } from "../src/utilities";
import type { ServiceAccount, Receipt, Distribution } from "../src/utilities";
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
  full_name: owner.full_name,
  role: "general_admin",
  person_id: 1,
  display_name: null,
  is_active: true,
  property_ids: [],
};
const account: ServiceAccount = {
  id: 20,
  property_id: 10,
  type_id: 1,
  type_name: "Electricidad",
  label: "Electricidad casa",
  provider: "Proveedor de prueba",
  account_number: "TEST",
  measurement_kind: "shared",
  measure_unit: "kWh",
  start_date: "2020-01-01",
  is_active: true,
  notes: null,
  version: 2,
  configuration: {
    id: 30,
    account_id: 20,
    revision: 1,
    method: "equal",
    unit_ids: [11, 12],
    percentages: [],
    economic_policy: "occupant",
    owner_person_id: 1,
    provider_payer_id: 1,
    reimbursement_person_id: 1,
    notes: null,
  },
};
const receipt: Receipt = {
  id: 40,
  revision_id: 41,
  revision: 1,
  version: 2,
  account_id: 20,
  property_id: 10,
  account_label: account.label,
  provider: account.provider,
  type_name: "Electricidad",
  external_reference: "REC-001",
  amount: "300.00",
  currency: "BOB",
  issued_on: "2031-01-31",
  period_start: "2031-01-01",
  period_end: "2031-01-30",
  due_on: "2031-02-10",
  consumption: null,
  fixed_amount: "0.00",
  document_reference: null,
  notes: null,
  distribution_status: "needs_review",
  latest_distribution_id: 50,
  current_distribution_id: null,
  payment_recorded: false,
};
const dist: Distribution = {
  id: 50,
  receipt_id: 40,
  receipt_revision_id: 41,
  receipt_version: 2,
  configuration_id: 30,
  configuration: account.configuration,
  receipt,
  status: "needs_review",
  version: 1,
  reason: null,
  supersedes_id: null,
  confirmed_at: null,
  confirmed_by: null,
  created_at: "2026-11-07T12:00:00",
  is_current: false,
  assigned_total: "300.00",
  responsibility_total: "300.00",
  payment_recorded: false,
  allocations: [
    {
      id: 60,
      unit_id: 11,
      unit_label: "A · Cuarto con patio",
      amount: "150.00",
      weight: "1",
      responsibilities: [
        {
          id: 70,
          allocation_id: 60,
          kind: "owner",
          person_id: 1,
          contract_id: null,
          amount: "150.00",
          occupied_days: null,
          theoretical_amount: null,
        },
      ],
    },
    {
      id: 61,
      unit_id: 12,
      unit_label: "B · Cuarto con ventana",
      amount: "150.00",
      weight: "1",
      responsibilities: [
        {
          id: 71,
          allocation_id: 61,
          kind: "owner",
          person_id: 1,
          contract_id: null,
          amount: "150.00",
          occupied_days: null,
          theoretical_amount: null,
        },
      ],
    },
  ],
  evidence: {
    period_days: 30,
    method: "equal",
    issues: [
      "Este cuarto tuvo varios ocupantes. Revise el reparto antes de confirmar.",
    ],
    spaces: [
      {
        unit_id: 11,
        label: "A",
        assigned_amount: "150",
        contracts: [],
        theoretical_total: "0",
        over_available: true,
      },
      {
        unit_id: 12,
        label: "B",
        assigned_amount: "150",
        contracts: [],
        theoretical_total: "0",
        over_available: false,
      },
    ],
  },
};
const units = [
  { id: 11, code: "A", name: "Cuarto con patio" },
  { id: 12, code: "B", name: "Cuarto con ventana" },
];
function response(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("recibo registra importes y fechas reales sin enviar campos de pago", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(receipt)),
    saved = vi.fn(async () => {});
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <ReceiptForm accounts={[account]} onCancel={() => {}} onSaved={saved} />,
  );
  await userEvent.type(
    screen.getByLabelText("Importe total del recibo"),
    "300.25",
  );
  await userEvent.clear(
    screen.getByLabelText("Fecha de emisión del recibo externo"),
  );
  await userEvent.type(
    screen.getByLabelText("Fecha de emisión del recibo externo"),
    "2031-02-28",
  );
  await userEvent.clear(screen.getByLabelText("Inicio del periodo de consumo"));
  await userEvent.type(
    screen.getByLabelText("Inicio del periodo de consumo"),
    "2031-02-01",
  );
  await userEvent.clear(screen.getByLabelText("Fin del periodo de consumo"));
  await userEvent.type(
    screen.getByLabelText("Fin del periodo de consumo"),
    "2031-02-28",
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar recibo" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({
    amount: "300.25",
    period_start: "2031-02-01",
    period_end: "2031-02-28",
    currency: "BOB",
  });
  expect(body).not.toHaveProperty("paid");
  expect(body).not.toHaveProperty("payment");
});

test("porcentajes y responsabilidades muestran controles separados y no infieren copropiedad", () => {
  render(
    <ConfigurationFields
      value={{
        ...account.configuration,
        owner_person_id: null,
        method: "percentage",
        percentages: [
          { unit_id: 11, percentage: "30" },
          { unit_id: 12, percentage: "70" },
        ],
      }}
      onChange={() => {}}
      units={units}
      people={[owner, tenant]}
    />,
  );
  expect(screen.getByLabelText("Porcentaje de Cuarto con patio")).toHaveValue(
    30,
  );
  expect(
    screen.getByLabelText("Persona que asume la parte del propietario"),
  ).toHaveValue("");
  expect(
    screen.getByLabelText(
      "Persona prevista para pagar al proveedor (opcional)",
    ),
  ).toHaveValue("1");
  expect(
    screen.getByLabelText(
      "Persona prevista para recibir reintegros (opcional)",
    ),
  ).toHaveValue("1");
});

test("propietario consulta servicios sin acciones para registrarlos o cambiarlos", () => {
  render(
    <Services
      property={property}
      user={{ ...user, role: "owner" }}
      accounts={[account]}
      types={[{ id: 1, name: "Electricidad", is_active: true }]}
      people={[owner]}
      units={units}
      reload={async () => {}}
    />,
  );
  expect(screen.getByRole("heading", { name: account.label })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Registrar servicio" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Cambiar reparto/ }),
  ).not.toBeInTheDocument();
});

function setupDetail(d: Distribution, role: User["role"] = "general_admin") {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/history")
      ? response({ revisions: [receipt], distributions: [d] })
      : response(receipt),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <ReceiptDetail
      initial={receipt}
      accounts={[account]}
      people={[owner, tenant]}
      units={units}
      user={{ ...user, role }}
      reload={async () => {}}
      onBack={() => {}}
    />,
  );
  return fetcher;
}

test("reparto ambiguo muestra el motivo y bloquea confirmación hasta resolver", async () => {
  setupDetail(dist);
  await screen.findByRole("heading", { name: /Resumen del reparto/ });
  expect(
    screen.getByRole("button", { name: "Confirmar distribución" }),
  ).toBeDisabled();
  expect(screen.getByText(dist.evidence.issues[0])).toBeVisible();
  expect(screen.getByText(/Total asignado:/)).toHaveTextContent("Bs 300,00");
});

test("operador puede ver el cálculo pero no confirmar ni revisar importes manualmente", async () => {
  setupDetail({ ...dist, status: "calculated" }, "operator");
  await screen.findByRole("heading", { name: /Resumen del reparto/ });
  expect(
    screen.queryByRole("button", { name: "Confirmar distribución" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Revisar importes manualmente" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Un administrador debe revisar/)).toBeVisible();
});

test("reparto confirmado conserva el resumen sin botones para modificar su resultado", async () => {
  setupDetail({
    ...dist,
    status: "confirmed",
    is_current: true,
    confirmed_at: "2026-11-07T12:00:00",
    confirmed_by: 1,
  });
  await screen.findByRole("heading", { name: /Resumen del reparto/ });
  expect(
    screen.queryByRole("button", { name: "Revisar importes manualmente" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/último reparto aprobado de este recibo/),
  ).toBeVisible();
  expect(
    screen.getByText(/Recibo registrado; no se ha registrado un pago/),
  ).toBeVisible();
});

test("presentación monetaria exacta conserva centavos grandes y redondea sin float", () => {
  expect(money("999999999999.99")).toBe("Bs 999.999.999.999,99");
  expect(money("72.415000")).toBe("Bs 72,42");
  expect(money("4.1E-8")).toBe("Bs 0,00");
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { Reminders } from "../src/pages/Reminders";
import { MessageComposer } from "../src/pages/reminders/MessageComposer";
import { Consents } from "../src/pages/reminders/Consents";
import type {
  Reminder,
  Proposal,
  Communication,
  ReminderData,
  Consent,
} from "../src/reminders";
import type { Person, Property, User } from "../src/types";

vi.mock("../src/api", () => ({ api: vi.fn() }));
const mocked = vi.mocked(api);
const base = "/properties/10/reminders";
const people: Person[] = [
  { id: 2, full_name: "Luis Inquilino", is_owner: false },
  { id: 1, full_name: "Ana Propietaria", is_owner: true },
].map((p) => ({
  ...p,
  document: null,
  phone: null,
  whatsapp: p.id === 2 ? "+59171234567" : "+12025550123",
  email: null,
  address: null,
  notes: null,
}));
const property: Property = {
  id: 10,
  name: "Casa Jardín",
  address: "Calle ficticia",
  city: "La Paz",
  zone: null,
  description: null,
  is_active: true,
  owners: [{ person_id: 1, share: 100 }],
  manager_ids: [],
};
const user: User = {
  id: 1,
  username: "admin",
  full_name: "Administración",
  display_name: null,
  person_id: 1,
  role: "general_admin",
  property_ids: [],
  is_active: true,
};
const notice: Reminder = {
  key: "debt:20",
  kind: "rent",
  kind_label: "Alquiler",
  purpose: "payments",
  property_id: 10,
  property_name: property.name,
  unit_id: 30,
  target_label: "A · Cuarto del jardín",
  person_id: 2,
  responsible_name: "Luis Inquilino",
  recipients: [{ id: 2, full_name: "Luis Inquilino" }],
  recipient_ids: [2],
  due_on: "2031-01-08",
  days_remaining: 7,
  days_overdue: null,
  amount: "500.00",
  currency: "BOB",
  concept: "Alquiler de enero",
  period: "2031-01-01 al 2031-01-31",
  priority: "upcoming",
  requires_attention: true,
  resolved: false,
  resolution_reason: null,
  allow_whatsapp: true,
  origin: { module: "finances", obligation_id: 20 },
  source_fingerprint: "a".repeat(64),
  attention_fingerprint: "b".repeat(64),
  notice_id: null,
  version: 0,
  attention_state: "pending",
  until_on: null,
  attention_history: [],
  applied: "1000.00",
};
const consent: Consent = {
  id: 5,
  person_id: 2,
  purpose: "payments",
  number: "59171234567",
  accepted_on: "2030-12-31",
  method: "Aceptación expresa por escrito",
  notes: null,
  version: 1,
  is_active: true,
  matches_current_number: true,
  recorded_by: 1,
  recorded_at: "2031-01-01T12:00:00",
  revoked_at: null,
  revoked_by: null,
};
const proposal: Proposal = {
  proposal_fingerprint: "c".repeat(64),
  event: notice,
  recipient_id: 2,
  recipient_name: "Luis Inquilino",
  number: consent.number,
  consent,
  text: "Buen día, Luis. Saldo pendiente BOB 500,00 por alquiler de enero.",
  template: { id: null, kind: "rent", version: 1, name: "Alquiler" },
};
const communication: Communication = {
  id: 7,
  notice_key: notice.key,
  notice_id: 2,
  version: 1,
  state: "prepared",
  recipient_id: 2,
  recipient_name: proposal.recipient_name,
  purpose: "payments",
  number: consent.number,
  masked_number: "*******4567",
  final_text: proposal.text,
  template_code: "rent",
  template_version: 1,
  source_fingerprint: notice.source_fingerprint,
  source_changed: false,
  consent_current: true,
  created_by: 1,
  created_at: "2031-01-01T12:00:00",
  can_confirm: true,
  event: notice,
  events: [],
};
const data: ReminderData = {
  items: [notice],
  today: "2031-01-01",
  summary: { pending: 1 },
  preferences: {
    property_id: 10,
    version: 0,
    snooze_days: 7,
    lead_days: [7, 3, 1],
    recipient_user_ids: [],
    types: [],
  },
};
const composerProps = {
  event: notice,
  base,
  userId: 1,
  onSaved: vi.fn(async () => {}),
  onCancel: vi.fn(),
  onConsent: vi.fn(),
};

beforeEach(() => {
  mocked.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function center(role: User["role"] = "general_admin") {
  mocked.mockImplementation(async (path) =>
    path.endsWith("/contacts") ? people : (data as never),
  );
  render(
    <Reminders
      user={{ ...user, role }}
      properties={[property]}
      onOrigin={vi.fn()}
    />,
  );
}
let stored: Communication;
function composerApi() {
  stored = structuredClone(communication);
  mocked.mockImplementation(async (path, method, body) => {
    if (path.includes("/proposal?")) return structuredClone(proposal) as never;
    if (path.endsWith("/messages")) {
      stored.final_text = (body as { text: string }).text;
      return { communication_id: 7, version: 1 } as never;
    }
    if (path.endsWith("/actions")) {
      const b = body as { action: string };
      if (b.action === "authorize_open") {
        stored.version = 2;
        return {
          communication_id: 7,
          version: 2,
          authorization_operation_id: 55,
          url: "https://wa.me/59171234567?text=texto%20de%20prueba",
        } as never;
      }
      stored.version++;
      stored.state = b.action;
      return { communication_id: 7, version: stored.version } as never;
    }
    return structuredClone(stored) as never;
  });
}
async function prepare() {
  render(<MessageComposer {...composerProps} />);
  await screen.findByLabelText("Mensaje para revisar y editar");
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar mensaje preparado" }),
  );
  await screen.findByText(
    "Mensaje preparado. El envío sigue a cargo del usuario.",
  );
}
function fakeTab() {
  const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  return tab;
}

test("el centro muestra el saldo parcial vigente y la fecha de Bolivia enviada por el servidor", async () => {
  center();
  const row = await screen.findByTestId(notice.key);
  expect(within(row).getByText(/500,00/)).toBeVisible();
  expect(within(row).queryByText(/1.500,00/)).not.toBeInTheDocument();
  expect(screen.getByText("01/01/2031")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Vencidos" }));
  expect(screen.getByText(/No hay avisos en esta selección/)).toBeVisible();
  expect(
    mocked.mock.calls.every(([, method]) => !method || method === "GET"),
  ).toBe(true);
});

test("revisar un aviso conserva la versión y huella del origen sin llamar a pagos", async () => {
  center();
  await userEvent.click(
    await screen.findByRole("button", { name: /Ver detalle de alquiler/ }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar mi revisión del aviso" }),
  );
  await waitFor(() =>
    expect(mocked.mock.calls.some(([, method]) => method === "POST")).toBe(
      true,
    ),
  );
  const call = mocked.mock.calls.find(([, method]) => method === "POST")!;
  expect(call[0]).toBe(`${base}/notices/debt:20/actions`);
  expect(call[2]).toMatchObject({
    expected_version: 0,
    expected_fingerprint: notice.attention_fingerprint,
    action: "reviewed",
    until_on: null,
  });
  expect(call[2]).not.toHaveProperty("amount");
});

test("el propietario consulta y atiende sus avisos sin controles para preparar mensajes", async () => {
  center("owner");
  await userEvent.click(
    await screen.findByRole("button", { name: /Ver detalle de alquiler/ }),
  );
  expect(
    screen.queryByRole("button", { name: "Preparar WhatsApp" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Guardar mi revisión del aviso" }),
  ).toBeVisible();
});

test("la aceptación no se preselecciona ni se deduce de un teléfono extranjero guardado", async () => {
  mocked.mockResolvedValue({
    items: [],
    purposes: { payments: "Pagos y servicios" },
  } as never);
  render(<Consents base={base} people={people} admin today={data.today} />);
  await screen.findByRole("option", { name: "Pagos y servicios" });
  const acceptance = screen.getByRole("checkbox", {
    name: /Confirmo que la persona aceptó/,
  });
  expect(acceptance).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: /agregar 591/ }),
  ).not.toBeChecked();
  await userEvent.selectOptions(
    screen.getByLabelText("Persona que autoriza WhatsApp"),
    "1",
  );
  expect(screen.getByLabelText("Número internacional autorizado")).toHaveValue(
    "+12025550123",
  );
  await userEvent.type(
    screen.getByLabelText("Cómo se obtuvo la aceptación"),
    "Documento firmado de prueba",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar y registrar consentimiento" }),
  );
  expect(
    mocked.mock.calls.filter(([, method]) => method === "POST"),
  ).toHaveLength(0);
  await userEvent.click(acceptance);
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar y registrar consentimiento" }),
  );
  await waitFor(() =>
    expect(mocked.mock.calls.some(([, method]) => method === "POST")).toBe(
      true,
    ),
  );
  expect(
    mocked.mock.calls.find(([, method]) => method === "POST")![2],
  ).toMatchObject({
    person_id: 1,
    number: "+12025550123",
    bolivia_local: false,
    explicitly_accepted: true,
    expected_version: 0,
  });
});

test("operadores y propietarios no reciben formularios para otorgar consentimiento", async () => {
  mocked.mockResolvedValue({
    items: [consent],
    purposes: { payments: "Pagos y servicios" },
  } as never);
  render(
    <Consents base={base} people={people} admin={false} today={data.today} />,
  );
  await screen.findByText("Vigente");
  expect(
    screen.queryByLabelText("Número internacional autorizado"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Revocar/ }),
  ).not.toBeInTheDocument();
});

test("sin consentimiento se muestra el error y no existe enlace ni apertura", async () => {
  mocked.mockRejectedValue(
    new Error("Se requiere consentimiento vigente para esta casa."),
  );
  const open = vi.spyOn(window, "open");
  render(<MessageComposer {...composerProps} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "consentimiento vigente",
  );
  expect(
    screen.getByRole("button", { name: "Revisar consentimiento y número" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Abrir WhatsApp" }),
  ).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
});

test("el mensaje editado se guarda como preparación sin abrir WhatsApp ni confirmar envío", async () => {
  composerApi();
  const open = vi.spyOn(window, "open");
  render(<MessageComposer {...composerProps} />);
  const field = await screen.findByLabelText("Mensaje para revisar y editar");
  fireEvent.change(field, {
    target: { value: proposal.text + "\n¿Podría revisarlo? á & + #" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar mensaje preparado" }),
  );
  await screen.findByText(
    "Mensaje preparado. El envío sigue a cargo del usuario.",
  );
  const saved = mocked.mock.calls.find(([path]) =>
    path.endsWith("/messages"),
  )![2];
  expect(saved).toMatchObject({
    text: proposal.text + "\n¿Podría revisarlo? á & + #",
    recipient_id: 2,
    expected_fingerprint: notice.source_fingerprint,
    expected_proposal_fingerprint: proposal.proposal_fingerprint,
  });
  expect(open).not.toHaveBeenCalled();
  expect(stored.state).toBe("prepared");
});

test("una ventana bloqueada no registra autorización ni apertura", async () => {
  composerApi();
  await prepare();
  vi.spyOn(window, "open").mockReturnValue(null);
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "bloqueó la ventana",
  );
  expect(
    mocked.mock.calls.filter(([path]) => path.endsWith("/actions")),
  ).toHaveLength(0);
});

test("abrir registra solamente apertura y la confirmación manual necesita otra acción", async () => {
  composerApi();
  await prepare();
  const tab = fakeTab();
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await screen.findByText(
    "Apertura registrada. No se ha confirmado que el mensaje se haya enviado.",
  );
  expect(tab.location.href).toMatch(/^https:\/\/wa\.me\//);
  expect(stored.state).toBe("opened");
  const actions = () =>
    mocked.mock.calls
      .filter(([path]) => path.endsWith("/actions"))
      .map(([, , body]) => (body as { action: string }).action);
  expect(actions()).toEqual(["authorize_open", "opened"]);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar que yo lo envié" }),
  );
  await screen.findByText(
    "Envío confirmado manualmente. No hay confirmación técnica de entrega o lectura.",
  );
  expect(actions()).toEqual(["authorize_open", "opened", "manual_sent"]);
});

test("un saldo cambiado bloquea la apertura y permite generar explícitamente el texto actual", async () => {
  composerApi();
  await prepare();
  const original = mocked.getMockImplementation()!;
  mocked.mockImplementation(async (path, method, body) => {
    if (path.endsWith("/actions"))
      throw new Error("El saldo cambió. Genere un texto actualizado.");
    if (path.includes("/proposal?"))
      return {
        ...proposal,
        event: { ...notice, amount: "300.00" },
        text: "Saldo actual BOB 300,00.",
      } as never;
    return original(path, method, body);
  });
  const tab = fakeTab();
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("saldo cambió");
  expect(tab.close).toHaveBeenCalled();
  expect(stored.state).toBe("prepared");
  await userEvent.click(
    screen.getByRole("button", { name: "Generar texto actualizado" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Mensaje para revisar y editar")).toHaveValue(
      "Saldo actual BOB 300,00.",
    ),
  );
});

test("un reintento tras respuesta perdida conserva la solicitud original y su versión", async () => {
  composerApi();
  await prepare();
  const original = mocked.getMockImplementation()!;
  let lost = true;
  mocked.mockImplementation(async (path, method, body) => {
    if (
      path.endsWith("/actions") &&
      (body as { action: string }).action === "authorize_open" &&
      lost
    ) {
      lost = false;
      stored.version = 2;
      throw new Error("Se perdió la respuesta. Reintente.");
    }
    return original(path, method, body);
  });
  fakeTab();
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Abrir WhatsApp" }),
    ).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  await screen.findByText(
    "Apertura registrada. No se ha confirmado que el mensaje se haya enviado.",
  );
  const attempts = mocked.mock.calls.filter(
    ([, , body]) =>
      body && (body as { action: string }).action === "authorize_open",
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[0][2]).toEqual(attempts[1][2]);
  expect(attempts[1][2]).toMatchObject({ expected_version: 1 });
});

test("una dirección ajena al dominio oficial se rechaza antes de registrar apertura", async () => {
  composerApi();
  await prepare();
  const original = mocked.getMockImplementation()!;
  mocked.mockImplementation(async (path, method, body) =>
    path.endsWith("/actions")
      ? ({
          communication_id: 7,
          version: 2,
          authorization_operation_id: 55,
          url: "https://wa.me.ejemplo.invalid/59171234567",
        } as never)
      : original(path, method, body),
  );
  const tab = fakeTab();
  await userEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("sitio oficial");
  expect(tab.location.href).toBe("");
  expect(tab.close).toHaveBeenCalled();
  expect(
    mocked.mock.calls.filter(
      ([, , body]) => body && (body as { action: string }).action === "opened",
    ),
  ).toHaveLength(0);
});

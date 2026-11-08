import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { Reports } from "../src/pages/Reports";
import { measureNames, money, presetDates, query } from "../src/reports";
import type { ReportData, ReportOptions } from "../src/reports";
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  api: vi.fn(),
}));
vi.mock("../src/components/ReportChart", () => ({
  default: ({ title }: { title: string }) => (
    <div role="img" aria-label={title} />
  ),
}));
const mocked = vi.mocked(api);
const summary = Object.fromEntries(
  Object.keys(measureNames).map((k) => [k, "0.00"]),
);
const options: ReportOptions = {
  properties: [{ id: 1, name: "Casa del jardín" }],
  owners: [{ id: 2, name: "Ana" }],
  units: [{ id: 3, name: "Cuarto A", property_id: 1 }],
  contracts: [{ id: 4, name: "Contrato 4", property_id: 1 }],
  people: [{ id: 5, name: "Luis" }],
  services: [{ id: 6, name: "Agua" }],
  categories: [{ id: 7, name: "Reparaciones" }],
  today: "2031-02-28",
};
const data: ReportData = {
  kind: "economic",
  title: "Reporte económico general",
  filters: {},
  period: {
    start: "2031-02-01",
    end: "2031-02-28",
    as_of: "2031-02-28",
    timezone: "America/La_Paz",
  },
  properties: options.properties,
  summary: [
    {
      ...summary,
      currency: "BOB",
      pending: "300.00",
      rent_pending: "300.00",
      cash_received: "200.00",
    },
  ],
  counts: {
    properties_registered: 1,
    properties_active: 1,
    units_available: 0,
    units_occupied: 1,
    contracts_active: 1,
    contracts_ending: 0,
    reminders_attention: 1,
  },
  series: [],
  occupancy: [],
  rows: [
    {
      id: 1,
      person: "Luis",
      concept: "Alquiler",
      total: "500.00",
      applied: "200.00",
      pending: "300.00",
      currency: "BOB",
    },
  ],
  movements: [],
  limitations: ["Cada moneda se consulta por separado."],
  total_rows: 1,
  has_data: true,
  fingerprint: "a".repeat(64),
  page: 1,
  page_size: 50,
  generated_at: "2031-02-28T12:00:00Z",
};
beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(async (path) =>
    path.startsWith("/reports/options") ? options : data,
  );
});

test("resumen muestra importes exactos y no suma monedas", async () => {
  mocked.mockImplementation(async (path) =>
    path.startsWith("/reports/options")
      ? options
      : {
          ...data,
          summary: [
            ...data.summary,
            {
              ...summary,
              currency: "USD",
              pending: "12.34",
              cash_received: "56.78",
            },
          ],
        },
  );
  render(<Reports view="dashboard" />);
  expect(
    await screen.findByRole("heading", { name: "Reporte económico general" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Resumen general",
  );
  expect(
    within(
      screen.getByRole("article", { name: "Total de entradas reales" }),
    ).getByText("200.00 BOB"),
  ).toBeVisible();
  await userEvent.selectOptions(
    screen.getByLabelText("Moneda para las cifras y gráficos"),
    "USD",
  );
  expect(
    within(
      screen.getByRole("article", { name: "Total de entradas reales" }),
    ).getByText("56.78 USD"),
  ).toBeVisible();
  expect(screen.queryByText("256.78")).not.toBeInTheDocument();
});

test("dispone de los diez reportes y aplica filtros juntos desde backend", async () => {
  render(<Reports view="reports" />);
  await screen.findByRole("heading", { name: "Reporte económico general" });
  expect(
    within(screen.getByLabelText("Tipo de reporte")).getAllByRole("option"),
  ).toHaveLength(10);
  await userEvent.selectOptions(
    screen.getByLabelText("Tipo de reporte"),
    "collections",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Propiedad", { exact: true }),
    "1",
  );
  await userEvent.click(screen.getByRole("button", { name: "Ver resultados" }));
  await waitFor(() =>
    expect(mocked).toHaveBeenCalledWith(
      expect.stringMatching(/^\/reports\/collections\?.*property_id=1/),
    ),
  );
});

test("periodos rápidos usan la fecha boliviana de la API", async () => {
  render(<Reports view="reports" />);
  await screen.findByRole("heading", { name: "Reporte económico general" });
  await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
  expect(screen.getByLabelText("Fecha inicial")).toHaveValue("2031-01-01");
  expect(screen.getByLabelText("Fecha final")).toHaveValue("2031-01-31");
  await userEvent.click(
    screen.getByRole("button", { name: "Últimos tres meses" }),
  );
  expect(screen.getByLabelText("Fecha inicial")).toHaveValue("2030-12-01");
});

test("vacío no se presenta como un saldo cero inventado", async () => {
  mocked.mockImplementation(async (path) =>
    path.startsWith("/reports/options")
      ? options
      : {
          ...data,
          summary: [],
          rows: [],
          series: [],
          has_data: false,
          total_rows: 0,
        },
  );
  render(<Reports view="reports" />);
  expect(
    await screen.findByText("No hay datos para este periodo."),
  ).toBeVisible();
  expect(screen.queryByText("0.00 BOB")).not.toBeInTheDocument();
});

test("un fallo específico permite volver a consultar", async () => {
  let failed = true;
  mocked.mockImplementation(async (path) => {
    if (path.startsWith("/reports/options")) return options;
    if (failed)
      throw new Error("No tiene permiso para consultar esta propiedad.");
    return data;
  });
  render(<Reports view="reports" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No tiene permiso",
  );
  failed = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Volver a consultar" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Reporte económico general" }),
  ).toBeVisible();
});

test("una respuesta antigua no reemplaza el último filtro", async () => {
  let release!: (value: ReportData) => void;
  let calls = 0;
  mocked.mockImplementation(async (path) => {
    if (path.startsWith("/reports/options")) return options;
    ++calls;
    if (calls === 1) return data;
    if (calls === 2)
      return new Promise<ReportData>((resolve) => {
        release = resolve;
      });
    return { ...data, title: "Consulta más reciente" };
  });
  render(<Reports view="reports" />);
  await screen.findByRole("heading", { name: "Reporte económico general" });
  await userEvent.click(screen.getByRole("button", { name: "Ver resultados" }));
  // Restablecer sigue disponible mientras llega una consulta anterior.
  await userEvent.click(
    screen.getByRole("button", { name: "Restablecer filtros" }),
  );
  await screen.findByRole("heading", { name: "Consulta más reciente" });
  release({ ...data, title: "Respuesta antigua" });
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Respuesta antigua" }),
    ).not.toBeInTheDocument(),
  );
});

test("descarga usa filtros y huella del reporte, sin afirmar éxito tras error", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          detail: "Los datos cambiaron después de la consulta.",
        }),
      }),
  );
  render(<Reports view="reports" />);
  await screen.findByRole("heading", { name: "Reporte económico general" });
  await userEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Los datos cambiaron",
  );
  expect(
    screen.queryByText("El reporte está listo para descargar."),
  ).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
    "expected_fingerprint=" + data.fingerprint,
  );
});

test("navegación por teclado y fecha de corte identificada", async () => {
  render(<Reports view="reports" />);
  await screen.findByRole("heading", { name: "Reporte económico general" });
  await userEvent.click(screen.getByText("Más filtros y fecha de corte"));
  const cutoff = screen.getByLabelText("Fecha de corte del saldo");
  cutoff.focus();
  expect(cutoff).toHaveFocus();
  fireEvent.change(cutoff, { target: { value: "2031-02-15" } });
  await userEvent.click(screen.getByRole("button", { name: "Ver resultados" }));
  await waitFor(() =>
    expect(mocked).toHaveBeenCalledWith(
      expect.stringContaining("as_of=2031-02-15"),
    ),
  );
});

test("formato textual conserva céntimos y parámetros no vacíos", () => {
  expect(money("999999999999.99", "BOB")).toBe("999999999999.99 BOB");
  expect(money(null)).toBe("Sin información");
  expect(query({ property_id: "1", owner_id: "" })).toBe("?property_id=1");
  expect(presetDates("previous", "2032-03-01").end_date).toBe("2032-02-29");
});

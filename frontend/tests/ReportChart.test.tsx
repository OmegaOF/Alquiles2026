import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ReportChart from "../src/components/ReportChart";
const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  resize: vi.fn(),
  setOption: vi.fn(),
  init: vi.fn(),
}));
vi.mock("echarts/core", () => ({
  use: vi.fn(),
  init: mocks.init.mockImplementation(() => mocks),
}));
test("ECharts actualiza filtros, conserva valores exactos y libera la instancia", () => {
  const { rerender, unmount } = render(
    <ReportChart
      title="Cargos"
      description="Al corte"
      unit="BOB"
      months={["2031-02"]}
      series={[{ name: "Saldo", values: ["123.45"] }]}
    />,
  );
  expect(mocks.init).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("img")).toHaveAccessibleName(/Cargos/);
  rerender(
    <ReportChart
      title="Cargos"
      description="Al corte"
      unit="USD"
      months={["2031-03"]}
      series={[{ name: "Saldo", values: ["456.78"] }]}
    />,
  );
  expect(mocks.init).toHaveBeenCalledTimes(1);
  expect(mocks.setOption).toHaveBeenCalledTimes(2);
  expect(screen.getByText("456.78")).toBeInTheDocument();
  unmount();
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
});
test("sin datos muestra explicación y no dibuja un cero", () => {
  render(
    <ReportChart
      title="Vacío"
      description="Sin información"
      unit="BOB"
      months={["2031-03"]}
      series={[{ name: "Saldo", values: [null] }]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No hay datos");
});

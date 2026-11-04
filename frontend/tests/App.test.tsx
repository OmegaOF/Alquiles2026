import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, test, expect } from "vitest";
import { App } from "../src/App";

test("muestra inicio accesible y no simula funciones futuras", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "todo en orden",
  );
  expect(screen.getAllByText("Próximamente")).toHaveLength(3);
  expect(screen.getByRole("navigation")).toHaveAccessibleName(
    "Navegación principal",
  );
});
test("comprueba la conexión real de la API al pulsar", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", database: "ok" }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: /Comprobar conexión/ }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Conexión correcta",
  );
  expect(fetcher.mock.calls[0][0]).toContain("/api/v1/ready");
});
test("permite reintentar tras un error sin mostrar datos técnicos", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  render(<App />);
  await userEvent.click(screen.getByRole("button"));
  expect(
    await screen.findByRole("button", { name: /Volver a intentar/ }),
  ).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("No se pudo conectar");
});

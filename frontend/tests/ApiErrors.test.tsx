import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
afterEach(() => vi.unstubAllGlobals());
test("los errores de validación identifican el campo sin revelar entradas", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: "Datos no válidos", fields: ["email"] }),
      }),
  );
  await expect(api("/persons", "POST", {})).rejects.toThrow(
    "Revisa correo electrónico",
  );
});

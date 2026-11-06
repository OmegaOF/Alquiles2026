import { test, expect } from "@playwright/test";
import { authenticate } from "./helpers";
test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("inicio conecta React con FastAPI y MySQL sin desbordar la pantalla", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /Comprobar conexión/ }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Conexión correcta. El sistema está disponible.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("un error permite reintentar y recuperar la conexión", async ({
  page,
}) => {
  await page.route("**/api/v1/ready", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await page.getByRole("button", { name: /Comprobar conexión/ }).click();
  await expect(page.getByRole("status")).toContainText("No se pudo conectar");
  await page.unroute("**/api/v1/ready");
  await page.getByRole("button", { name: /Volver a intentar/ }).click();
  await expect(page.getByRole("status")).toContainText("Conexión correcta");
});

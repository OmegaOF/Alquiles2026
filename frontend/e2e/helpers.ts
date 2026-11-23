import type { Page } from "@playwright/test";

export const apiBase = process.env.E2E_API_BASE || "http://127.0.0.1:8000";
export function credentials() {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password)
    throw new Error(
      "Configura E2E_USERNAME y E2E_PASSWORD de una cuenta de pruebas antes de ejecutar E2E.",
    );
  return { username, password };
}
export async function authenticate(page: Page) {
  const response = await page.request.post(`${apiBase}/api/v1/auth/login`, {
    data: credentials(),
  });
  if (!response.ok())
    throw new Error(
      `No se pudo autenticar la cuenta de pruebas (${response.status()}).`,
    );
}

export async function openSection(page: Page, group: string, section: string) {
  const groups = page.getByRole("navigation", { name: "Navegación principal" });
  const submenu = page.getByRole("navigation", {
    name: `Opciones de ${group}`,
  });
  await groups.waitFor();
  if (!(await submenu.isVisible())) {
    const mobile = groups.getByRole("button", { name: /Cambiar grupo/ });
    if (await mobile.isVisible()) await mobile.click();
    await groups.getByRole("button", { name: group, exact: true }).click();
  }
  await submenu.getByRole("button", { name: section, exact: true }).click();
}

export async function selectRecord(
  field: import("@playwright/test").Locator,
  value: string | { label: string },
) {
  if (await field.evaluate((control) => control.tagName === "SELECT")) {
    await field.selectOption(value);
    return;
  }
  await field.click();
  await field.fill(typeof value === "string" ? value : value.label);
  const options = field.page().getByRole("option");
  const result =
    typeof value === "string"
      ? options.and(
          field.page().locator(`[data-value=${JSON.stringify(value)}]`),
        )
      : options.filter({ hasText: value.label });
  await result.click();
}

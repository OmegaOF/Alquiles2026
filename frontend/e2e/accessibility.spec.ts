import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { authenticate, openSection } from "./helpers";

test("revisa WCAG 2.2 AA en la entrada, el inicio y el buscador de casas", async ({
  page,
}) => {
  async function check(view: string) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((violation) => ({
        rule: violation.id,
        affected: violation.nodes.map((node) => node.target),
      })),
      view,
    ).toEqual([]);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await check("Inicio de sesión");

  await authenticate(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Inicio", exact: true }),
  ).toBeVisible();
  await check("Inicio");

  const groups = page.getByRole("navigation", { name: "Navegación principal" });
  const toggle = groups.getByRole("button", { name: /Cambiar grupo/ });
  if (await toggle.isVisible()) {
    await toggle.click();
    await check("Menú móvil expandido");
    await toggle.click();
  }

  await openSection(page, "Casas y cuartos", "Cuartos");
  await page
    .getByRole("button", { name: "Registrar cuarto", exact: true })
    .click();
  const picker = page.getByRole("combobox", { name: "¿A qué casa pertenece?" });
  await picker.fill("consulta inexistente");
  await expect(
    page.getByText("No se encontraron resultados.", { exact: true }),
  ).toBeVisible();
  await check("Búsqueda sin resultados");
  await picker.press("Escape");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "+ Registrar casa", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Registrar casa" }),
  ).toBeVisible();
  await check("Diálogo de alta contextual");
});

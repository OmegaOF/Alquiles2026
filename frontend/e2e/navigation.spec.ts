import { expect, test } from "@playwright/test";
import { authenticate } from "./helpers";

test("organiza las secciones autorizadas y empieza en Inicio", async ({ page }) => {
  await authenticate(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  const groups = page.getByRole("navigation", { name: "Navegación principal" });
  const toggle = groups.getByRole("button", { name: /Cambiar grupo/ });
  const expected = [
    ["Inicio", "Resumen", "Avisos", "Pendientes"],
    ["Casas y cuartos", "Mis casas", "Cuartos", "Disponibilidad"],
    ["Alquileres", "Contratos", "Reservas", "Inquilinos", "Anticréticos"],
    ["Cobros y gastos", "Cobros", "Deudas", "Servicios", "Gastos"],
    ["Reportes", "Ingresos", "Ocupación", "Historial", "PDF"],
    ["Configuración", "Personas", "Usuarios", "Seguridad"],
  ];
  if (await toggle.isVisible()) await toggle.click();
  await expect(groups.locator("#workspace-groups button")).toHaveText(
    expected.map(([name]) => new RegExp(name)),
  );
  for (const [index, [group, ...sections]] of expected.entries()) {
    if (index && await toggle.isVisible()) await toggle.click();
    await groups.getByRole("button", { name: group, exact: true }).click();
    await expect(page.getByRole("navigation", { name: /Opciones de/ })).toHaveCount(1);
    const menu = page.getByRole("navigation", { name: `Opciones de ${group}` });
    await expect(menu.getByRole("button")).toHaveText(sections);
    await expect(menu.getByRole("button", { name: sections[0], exact: true })).toHaveAttribute("aria-current", "page");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

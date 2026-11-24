import { test, expect } from "@playwright/test";
import { authenticate, openSection } from "./helpers";

test("registra propietario, casa y cuarto sin perder los formularios abiertos", async ({
  page,
}) => {
  test.setTimeout(60000);
  await authenticate(page);
  await page.goto("/");
  await openSection(page, "Casas y cuartos", "Cuartos");
  page.on("dialog", async (dialog) => {
    if (dialog.message().includes("descartar")) await dialog.dismiss();
    else await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Registrar cuarto", exact: true })
    .click();
  const code = page.getByLabel("Número o identificador", { exact: true });
  await code.fill("UX-14");
  await page.getByLabel("Nombre del cuarto o unidad").fill("Cuarto con sol");
  await page
    .getByRole("button", { name: "+ Registrar casa", exact: true })
    .click();
  const houseDialog = page.getByRole("dialog", {
    name: "Registrar casa",
    exact: true,
  });
  const house = `Casa de contexto ${test.info().project.name} ${Date.now()}`;
  await houseDialog.getByLabel("Nombre de la propiedad").fill(house);
  await houseDialog
    .getByLabel("Dirección", { exact: true })
    .fill("Calle de la Pradera");
  await houseDialog.getByLabel("Ciudad", { exact: true }).fill("La Paz");
  await houseDialog
    .getByRole("button", { name: "+ Registrar propietario", exact: true })
    .click();
  const ownerDialog = page.getByRole("dialog", {
    name: "Registrar propietario",
    exact: true,
  });
  const owner = `Propietaria de contexto ${Date.now()}`;
  await ownerDialog.getByLabel("Nombre completo", { exact: true }).fill(owner);
  await ownerDialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(ownerDialog).toHaveCount(0);
  await expect(
    houseDialog.getByRole("combobox", { name: "Propietario 1", exact: true }),
  ).toHaveValue(owner);
  await expect(houseDialog.getByLabel("Nombre de la propiedad")).toHaveValue(
    house,
  );
  await houseDialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(houseDialog).toHaveCount(0);
  await expect(code).toHaveValue("UX-14");
  await expect(
    page.getByRole("combobox", { name: "¿A qué casa pertenece?" }),
  ).toHaveValue(new RegExp(house));
  await page.getByRole("button", { name: "Mis casas", exact: true }).click();
  await expect(code).toHaveValue("UX-14");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: /UX-14.*Cuarto con sol/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mis casas", exact: true }).click();
  await page.getByRole("searchbox", { name: "Buscar casas" }).fill(house);
  await page
    .getByRole("button", { name: `Ver propiedad ${house}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar cuarto", exact: true })
    .click();
  await expect(
    page.getByText(house, { exact: false }).filter({ hasText: "Casa ·" }),
  ).toBeVisible();
  await page
    .getByLabel("Número o identificador", { exact: true })
    .fill("UX-15");
  await page.getByLabel("Nombre del cuarto o unidad").fill("Cuarto con balcón");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: /UX-15.*Cuarto con balcón/ }),
  ).toBeVisible();

  await openSection(page, "Casas y cuartos", "Cuartos");
  await page
    .getByRole("button", { name: "Registrar cuarto", exact: true })
    .click();
  const search = page.getByRole("combobox", { name: "¿A qué casa pertenece?" });
  await search.fill(house);
  await expect(
    page.getByRole("option", { name: new RegExp(house) }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue(new RegExp(house));
  await page
    .getByLabel("Número o identificador", { exact: true })
    .fill("UX-16");
  await page
    .getByLabel("Nombre del cuarto o unidad")
    .fill("Cuarto desde el listado");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "UX-16 · Cuarto desde el listado" }),
  ).toBeVisible();
});

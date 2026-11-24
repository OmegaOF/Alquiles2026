import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Properties } from "../src/pages/Properties";
import type { Property, User } from "../src/types";

const user: User = {
  id: 1,
  username: "admin",
  full_name: "Administración",
  person_id: 1,
  display_name: null,
  role: "general_admin",
  is_active: true,
  property_ids: [],
};
const houses: Property[] = Array.from({ length: 51 }, (_, index) => ({
  id: index + 1,
  name: `Casa ${index + 1}`,
  address: `Calle ${index + 1}`,
  zone: index === 50 ? "Última zona" : "Centro",
  city: "La Paz",
  description: null,
  is_active: index !== 50,
  owners: [],
  manager_ids: [],
}));

test("Mis casas busca en todas las páginas y pagina de veinte en veinte", async () => {
  const input = userEvent.setup();
  render(
    <Properties
      properties={houses}
      people={[]}
      users={[]}
      user={user}
      refresh={async () => {}}
    />,
  );
  const visible = () =>
    screen.queryAllByRole("button", { name: /^Ver propiedad/ });
  expect(visible()).toHaveLength(20);
  expect(screen.getByText("51 resultados · 1–20")).toBeVisible();
  await input.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(visible()).toHaveLength(20);
  expect(screen.getByText("51 resultados · 21–40")).toBeVisible();
  await input.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(visible()).toHaveLength(11);
  expect(screen.getByText("Deshabilitada")).toBeVisible();
  const search = screen.getByRole("searchbox", { name: "Buscar casas" });
  await input.type(search, "ultima zona");
  expect(visible()).toHaveLength(1);
  expect(visible()[0]).toHaveAccessibleName("Ver propiedad Casa 51");
  expect(screen.getByText("1 resultado")).toBeVisible();
  await input.clear(search);
  expect(screen.getByText("51 resultados · 1–20")).toBeVisible();
  await input.type(search, "inexistente");
  expect(visible()).toHaveLength(0);
  expect(screen.getByText("0 resultados")).toBeVisible();
  expect(screen.getByText("No se encontraron casas.")).toBeVisible();
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SearchSelect } from "../src/components/SearchSelect";

test("selecciona por teclado, cambia por documento y quita la relación", async () => {
  const user = userEvent.setup();
  render(<form><SearchSelect label="Persona" name="person_id" required options={[
    { value: 29, label: "María Quispe", search: "CI-A200 +591 701 00 100 maria@example.test" },
    { value: 30, label: "Mario Quispe", search: "CI-A201" },
    { value: 31, label: "María León", disabled: true },
  ]} /></form>);
  const field = screen.getByRole("combobox", { name: "Persona" });
  await user.type(field, "maria");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(field).toHaveValue("María Quispe");
  const form = field.closest("form")!;
  expect(new FormData(form).get("person_id")).toBe("29");
  await user.click(screen.getByRole("button", { name: "Cambiar persona" }));
  await user.type(field, "CI-A201");
  await user.click(screen.getByRole("option", { name: "Mario Quispe" }));
  expect(new FormData(form).get("person_id")).toBe("30");
  await user.click(screen.getByRole("button", { name: "Quitar persona" }));
  expect(form.checkValidity()).toBe(false);
  await user.type(field, "no existe");
  expect(screen.getByRole("status")).toHaveTextContent("No se encontraron resultados.");
  await user.clear(field);
  await user.type(field, "31");
  expect(screen.getByRole("option", { name: "María León" })).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(new FormData(form).get("person_id")).toBe("");
  await user.clear(field);
  await user.type(field, "70100100");
  expect(screen.getByRole("option", { name: "María Quispe" })).toBeVisible();
});

test("consulta el servidor al abrir y permite cargar otra página", async () => {
  const user = userEvent.setup();
  const load = vi.fn(async (_query: string, page: number) => ({
    options: [{ value: page, label: `Casa ${page}` }],
    hasMore: page === 1,
  }));
  render(<SearchSelect label="Casa" options={[]} load={load} />);
  const field = screen.getByRole("combobox", { name: "Casa" });
  expect(load).not.toHaveBeenCalled();
  await user.type(field, "Norte");
  expect(await screen.findByRole("option", { name: "Casa 1" })).toBeVisible();
  expect(load.mock.calls).toEqual([["Norte", 1]]);
  await user.click(screen.getByRole("button", { name: "Más resultados" }));
  expect(await screen.findByRole("option", { name: "Casa 2" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Casa 1" })).toBeVisible();
});

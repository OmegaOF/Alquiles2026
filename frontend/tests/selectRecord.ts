import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export async function selectRecord(field: HTMLElement, value: string) {
  if (field instanceof HTMLSelectElement)
    return userEvent.selectOptions(field, value);
  await userEvent.click(field);
  await userEvent.type(field, value);
  const list = await screen.findByRole("listbox");
  const option = Array.from(
    list.querySelectorAll<HTMLElement>("[data-value]"),
  ).find((record) => record.dataset.value === value);
  if (!option) throw new Error(`No se encontró el registro ${value}`);
  await userEvent.click(option);
}

import { SearchSelect, propertyOption } from "./SearchSelect";
import { useRegistrySearch } from "./registrySearch";
import type { Property } from "../types";

export function PropertySelect({
  label,
  properties,
  value,
  onChange,
  disabled,
  required,
  hint,
  activeOnly = false,
}: {
  label: string;
  properties: Property[];
  value: string | number;
  onChange: (id: string) => void;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  activeOnly?: boolean;
}) {
  const load = useRegistrySearch(
    "properties",
    properties.length,
    undefined,
    activeOnly,
  );
  return (
    <SearchSelect
      label={label}
      options={properties.map((property) => ({
        ...propertyOption(property),
        disabled: activeOnly && !property.is_active,
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      required={required}
      load={load}
      hint={hint}
      placeholder="Buscar por nombre, dirección o ID"
    />
  );
}

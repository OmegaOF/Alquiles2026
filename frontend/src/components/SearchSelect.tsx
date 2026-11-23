import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Person, Property, Unit } from "../types";

export type SearchOption = {
  value: string | number;
  label: string;
  search?: string;
  disabled?: boolean;
};

type SearchPage = { options: SearchOption[]; hasMore: boolean };
export type SearchLoader = (query: string, page: number) => Promise<SearchPage>;

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function personOption(person: Person): SearchOption {
  return {
    value: person.id,
    label: [person.full_name, person.document || person.phone || person.email]
      .filter(Boolean)
      .join(" · "),
    search: [
      person.document,
      person.phone,
      person.whatsapp,
      person.email,
      person.address,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function propertyOption(property: Property): SearchOption {
  return {
    value: property.id,
    label: [property.name, property.address, property.zone, property.city]
      .filter(Boolean)
      .join(" · "),
    search: property.name,
  };
}

export function unitOption(
  unit: Pick<Unit, "id" | "code" | "name" | "maintenance" | "is_enabled">,
): SearchOption {
  return {
    value: unit.id,
    label: `${unit.code} · ${unit.name}${!unit.is_enabled ? " · Deshabilitado" : unit.maintenance ? " · En mantenimiento" : ""}`,
  };
}

export function SearchSelect({
  label,
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  load,
  disabled = false,
  required = false,
  placeholder = "Escribe para buscar",
  clearLabel = "Quitar",
  hint,
}: {
  label: string;
  id?: string;
  name?: string;
  options: SearchOption[];
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string) => void;
  load?: SearchLoader;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  clearLabel?: string;
  hint?: string;
}) {
  const uid = useId();
  const inputId = id ?? uid;
  const listId = uid + "-results";
  const input = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState(String(defaultValue));
  const selectedValue = String(value ?? internal);
  const [lastSelected, setLastSelected] = useState<SearchOption>();
  const selected =
    options.find((option) => String(option.value) === selectedValue) ??
    (String(lastSelected?.value) === selectedValue ? lastSelected : undefined);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(-1);
  const [page, setPage] = useState(1);
  const [remote, setRemote] = useState<SearchPage>();
  const [failed, setFailed] = useState(false);
  const expanded = open && !disabled;
  const search = normalizeSearch(query);
  const tokens = search.split(/\s+/).filter(Boolean);
  const local = load
    ? []
    : options.filter((option) => {
        const text = normalizeSearch(
          `${option.label} ${option.search ?? ""} ${option.value}`,
        );
        const digits = search.replace(/\D/g, "");
        return (
          tokens.every((token) => text.includes(token)) ||
          (/^[+\d\s().-]+$/.test(search) &&
            digits.length >= 4 &&
            [option.label, ...(option.search ?? "").split(/\s{2,}/)].some(
              (entry) => entry.replace(/\D/g, "").includes(digits),
            ))
        );
      });
  if (search)
    local.sort(
      (first, second) =>
        Number(String(second.value) === search) -
        Number(String(first.value) === search),
    );
  const pageSize = 12;
  const results = load
    ? (remote?.options ?? [])
    : local.slice(0, page * pageSize);
  const more = load ? remote?.hasMore : local.length > page * pageSize;
  const loading = expanded && Boolean(load) && !failed && !remote;

  useEffect(() => {
    input.current?.setCustomValidity(
      required && !selectedValue ? "Selecciona una opción de la lista." : "",
    );
  }, [required, selectedValue]);
  useEffect(() => {
    if (!expanded || !load) return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        load(query.trim(), page)
          .then((next) => {
            if (active) {
              setRemote((previous) => ({
                options:
                  page === 1
                    ? next.options
                    : [...(previous?.options ?? []), ...next.options],
                hasMore: next.hasMore,
              }));
            }
          })
          .catch(() => {
            if (active) setFailed(true);
          });
      },
      page === 1 ? 220 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [expanded, load, page, query]);

  function change(next?: SearchOption) {
    const newValue = next ? String(next.value) : "";
    if (value === undefined) setInternal(newValue);
    setLastSelected(next);
    const form = input.current?.form;
    if (form?.hasAttribute("data-guard-changes") && selectedValue !== newValue)
      form.dataset.dirty = "true";
    onChange?.(newValue);
    setOpen(false);
    resetSearch("");
  }

  function resetSearch(text: string) {
    setQuery(text);
    setIndex(-1);
    setPage(1);
    setRemote(undefined);
    setFailed(false);
  }

  function openSearch() {
    if (!open) resetSearch("");
    setOpen(true);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) openSearch();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let next =
        index === -1 && direction < 0 ? results.length - 1 : index + direction;
      while (results[next]?.disabled) next += direction;
      if (results[next]) {
        setIndex(next);
        document
          .getElementById(`${listId}-${next}`)
          ?.scrollIntoView?.({ block: "nearest" });
      }
    }
    if (event.key === "Enter" && expanded) {
      event.preventDefault();
      if (results[index] && !results[index].disabled) change(results[index]);
    }
  }

  return (
    <div
      className="field search-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={input}
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && index >= 0 ? `${listId}-${index}` : undefined
        }
        aria-describedby={hint ? uid + "-hint" : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        value={expanded ? query : (selected?.label ?? "")}
        onFocus={(event) => {
          if (!expanded) event.currentTarget.select();
        }}
        onClick={openSearch}
        onChange={(event) => {
          openSearch();
          resetSearch(event.target.value);
        }}
        onKeyDown={keyDown}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
          disabled={disabled}
        />
      )}
      {hint && <small id={uid + "-hint"}>{hint}</small>}
      {expanded && (
        <div className="search-results">
          <ul
            id={listId}
            role="listbox"
            aria-label="Resultados de búsqueda"
            aria-busy={loading || undefined}
          >
            {results.map((option, i) => (
              <li
                id={`${listId}-${i}`}
                role="option"
                key={option.value}
                aria-selected={index === i}
                aria-disabled={option.disabled || undefined}
                data-value={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!option.disabled) change(option);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
          {loading && <p role="status">Buscando…</p>}
          {failed && (
            <p role="status">
              No se pudo buscar. Cierra el buscador y vuelve a intentarlo.
            </p>
          )}
          {!loading && !failed && !results.length && (
            <p role="status">No se encontraron resultados.</p>
          )}
          {more && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPage(page + 1);
                input.current?.focus();
              }}
            >
              Más resultados
            </button>
          )}
        </div>
      )}
      {selected && !disabled && (
        <div className="search-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              openSearch();
              input.current?.focus();
            }}
          >
            Cambiar<span className="sr-only"> {label.toLowerCase()}</span>
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              change();
              input.current?.focus();
            }}
          >
            {clearLabel}
            <span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        </div>
      )}
    </div>
  );
}

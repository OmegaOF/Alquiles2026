import { useEffect, useState } from "react";
import { api } from "../api";
import { Field, errorText } from "./Form";
import { normalizeSearch } from "./SearchSelect";

export const pageSize = 20;

export function lastPage(total: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function ListSearch({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="search"
        maxLength={200}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          event.stopPropagation();
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

export function ListPagination({
  label,
  total,
  page,
  onPage,
}: {
  label: string;
  total: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const pages = lastPage(total);
  return (
    <div className="list-pagination">
      <p role="status">
        {total === 1 ? "1 resultado" : `${total} resultados`}
        {pages > 1 &&
          ` · ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`}
      </p>
      {pages > 1 && (
        <nav aria-label={`Paginación de ${label}`}>
          <button
            type="button"
            className="secondary"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </div>
  );
}

export function useLocalList<T>(items: T[], searchable: (item: T) => string) {
  const [query, setQuery] = useState("");
  const [requestedPage, setPage] = useState(1);
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const matches = tokens.length
    ? items.filter((item) => {
        const text = normalizeSearch(searchable(item));
        return tokens.every((token) => text.includes(token));
      })
    : items;
  const page = Math.min(requestedPage, lastPage(matches.length));
  return {
    search: {
      value: query,
      onChange: (value: string) => {
        setQuery(value);
        setPage(1);
      },
    },
    pagination: { total: matches.length, page, onPage: setPage },
    rows: matches.slice((page - 1) * pageSize, page * pageSize),
  };
}

export function useListRequest<T>(
  path: string | null,
  delay = 0,
  refreshKey = 0,
) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    version: number;
    refreshKey: number;
    data?: T;
    error?: string;
  }>();
  const [previousData, setPreviousData] = useState<T>();
  useEffect(() => {
    if (!path) return;
    let active = true;
    const timer = window.setTimeout(() => {
      api<T>(path).then(
        (data) => {
          if (!active) return;
          setPreviousData(data);
          setResult({ path, version, refreshKey, data });
        },
        (error) => {
          if (active)
            setResult({ path, version, refreshKey, error: errorText(error) });
        },
      );
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [path, version, delay, refreshKey]);
  const current =
    path &&
    result?.path === path &&
    result.version === version &&
    result.refreshKey === refreshKey
      ? result
      : undefined;
  return {
    data: current?.data,
    previousData,
    error: current?.error ?? "",
    loading: Boolean(path && !current),
    reload: () => setVersion((value) => value + 1),
  };
}

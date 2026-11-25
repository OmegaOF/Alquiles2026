import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode, SetStateAction } from "react";
import { api } from "../api";
import { Field, errorText } from "./Form";
import { normalizeSearch } from "./SearchSelect";
import "./recordList.css";

export const ListPreferences = createContext<Map<string, unknown> | null>(null);

export function useListPreference<T>(key: string | undefined, initial: T) {
  const preferences = useContext(ListPreferences);
  const [local, setLocal] = useState(initial);
  const value =
    key && preferences?.has(key) ? (preferences.get(key) as T) : local;
  const [, invalidate] = useState(0);
  return [
    value,
    (next: SetStateAction<T>) => {
      if (!key || !preferences) {
        setLocal(next);
        return;
      }
      const previous = preferences.has(key)
        ? (preferences.get(key) as T)
        : value;
      const result =
        typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      if (Object.is(previous, result)) return;
      preferences.set(key, result);
      invalidate((version) => version + 1);
    },
  ] as const;
}

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

export function useLocalList<T>(
  items: T[],
  searchable: (item: T) => string,
  listId?: string,
) {
  const [query, setQuery] = useListPreference(listId && `${listId}:search`, "");
  const [requestedPage, setPage] = useListPreference(
    listId && `${listId}:page`,
    1,
  );
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

export function RecordRow({
  title,
  fields,
  actions,
  detail,
  expanded,
  detailLabel = "Ver detalle",
  testId,
}: {
  title: ReactNode;
  fields?: ReactNode;
  actions?: ReactNode;
  detail?: ReactNode;
  expanded?: ReactNode;
  detailLabel?: string;
  testId?: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <article className="record-row" data-testid={testId}>
      <div>
        <h3 className="record-row-title">{title}</h3>
        {fields && <dl className="record-row-fields">{fields}</dl>}
      </div>
      {actions && <div className="record-row-actions">{actions}</div>}
      {expanded && <div className="record-row-expanded">{expanded}</div>}
      {detail && (
        <details
          className="record-row-detail"
          onToggle={(event) => {
            if (event.currentTarget.open) setOpened(true);
          }}
        >
          <summary>{detailLabel}</summary>
          {opened && detail}
        </details>
      )}
    </article>
  );
}

export function RecordField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function RecordCollection<T>({
  id,
  label,
  items,
  searchable,
  render,
  filter,
  empty = "No se encontraron registros.",
}: {
  id?: string;
  label: string;
  items: T[];
  searchable: (item: T) => string;
  render: (item: T) => ReactNode;
  filter?: { label: string; value: (item: T) => string };
  empty?: string;
}) {
  const [selectedFilter, setFilter] = useListPreference(
    id && `${id}:filter`,
    "",
  );
  const options = filter
    ? [...new Set([...items.map(filter.value), selectedFilter])]
        .filter(Boolean)
        .sort()
    : [];
  const list = useLocalList(
    filter && selectedFilter
      ? items.filter((item) => filter.value(item) === selectedFilter)
      : items,
    searchable,
    id,
  );
  return (
    <section aria-label={label}>
      <div className="record-filters">
        <ListSearch label={`Buscar ${label}`} {...list.search} />
        {filter && (selectedFilter || options.length > 1) && (
          <Field label={filter.label}>
            <select
              value={selectedFilter}
              onChange={(event) => {
                setFilter(event.target.value);
                list.pagination.onPage(1);
              }}
            >
              <option value="">Todos</option>
              {options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {list.rows.length ? (
        <div className="record-rows">{list.rows.map(render)}</div>
      ) : (
        <p className="record-empty">{empty}</p>
      )}
      <ListPagination label={label} {...list.pagination} />
    </section>
  );
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

import { useCallback } from "react";
import { api } from "../api";
import type { SearchLoader } from "./SearchSelect";

export function useRegistrySearch(
  kind: "properties" | "people" | "owners" | "contacts" | "units",
  count: number,
  propertyId?: number,
  activeOnly = false,
): SearchLoader | undefined {
  const load = useCallback<SearchLoader>(
    (query, page) => {
      const params = new URLSearchParams({ q: query, page: String(page) });
      if (propertyId) params.set("property_id", String(propertyId));
      if (activeOnly) params.set("active_only", "true");
      return api(`/lookup/${kind}?${params}`);
    },
    [kind, propertyId, activeOnly],
  );
  return count > 40 ? load : undefined;
}

export function useUnitSearch(propertyId: number, count: number) {
  const load = useRegistrySearch("units", count, propertyId);
  const withHouse = useCallback<SearchLoader>(
    async (query, page) => {
      if (!load) return { options: [], hasMore: false };
      const result = await load(query, page);
      const text = query.toLowerCase();
      if (page === 1 && (text === "0" || "casa completa".includes(text))) {
        return {
          ...result,
          options: [{ value: 0, label: "Casa completa" }, ...result.options],
        };
      }
      return result;
    },
    [load],
  );
  return load ? withHouse : undefined;
}

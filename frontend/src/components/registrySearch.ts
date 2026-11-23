import { useCallback } from "react";
import { api } from "../api";
import type { SearchLoader } from "./SearchSelect";

export function useRegistrySearch(
  kind: "properties" | "people" | "owners" | "contacts" | "units",
  count: number,
  propertyId?: number,
  activeOnly = false,
): SearchLoader | undefined {
  const load = useCallback<SearchLoader>((query, page) => {
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (propertyId) params.set("property_id", String(propertyId));
    if (activeOnly) params.set("active_only", "true");
    return api(`/lookup/${kind}?${params}`);
  }, [kind, propertyId, activeOnly]);
  return count > 40 ? load : undefined;
}

import { useMemo } from "react";
import { countByStatus, DEFAULT_FILTERS, filterItems, type InventoryFilters } from "@/lib/inventory/dashboard";
import { formatUnits, plural } from "@/lib/inventory/format";
import { cardClass } from "@/components/ui/styles";
import { NoResults } from "../dashboard-states";
import { InventoryFiltersBar } from "../inventory-filters";
import { InventoryTable } from "../inventory-table";
import type { InventoryData } from "../use-inventory-data";

interface InventoryTabProps {
  data: InventoryData;
  filters: InventoryFilters;
  onFiltersChange: (filters: InventoryFilters) => void;
  onEditRule: (levelId: string) => void;
}

/** Every stock level, with status tabs, search, a location filter and per-item rules. */
export function InventoryTab({ data, filters, onFiltersChange, onEditRule }: InventoryTabProps) {
  const { items, summary, locations, untrackedCount, mode } = data;
  const visibleItems = useMemo(() => filterItems(items, filters), [items, filters]);
  const statusCounts = useMemo(() => countByStatus(filterItems(items, { ...filters, status: "all" })), [items, filters]);

  return (
    <section aria-label="Inventory" className={`${cardClass} overflow-hidden`}>
      <InventoryFiltersBar filters={filters} counts={statusCounts} locations={locations} onChange={onFiltersChange} />

      {visibleItems.length === 0 ? (
        <NoResults onClear={() => onFiltersChange(DEFAULT_FILTERS)} />
      ) : (
        <InventoryTable items={visibleItems} source={mode === "live" ? "live" : "demo"} onEditRule={onEditRule} />
      )}

      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        Showing {formatUnits(visibleItems.length)} of {plural(items.length, "item")}
        {untrackedCount > 0 && ` · ${plural(untrackedCount, "untracked variant")} not shown`}
        {summary.invalidRules > 0 &&
          ` · ${plural(summary.invalidRules, "rule")} ${summary.invalidRules === 1 ? "needs" : "need"} fixing`}
      </p>
    </section>
  );
}

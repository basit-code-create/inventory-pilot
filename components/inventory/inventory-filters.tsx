import { STATUS_FILTERS, type InventoryFilters, type StatusFilter } from "@/lib/inventory/dashboard";
import { formatUnits } from "@/lib/inventory/format";
import { SearchIcon } from "@/components/ui/icons";
import { focusRingClass, inputClass } from "@/components/ui/styles";

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  needs_reorder: "Needs reorder",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  in_stock: "In stock",
};

interface InventoryFiltersBarProps {
  filters: InventoryFilters;
  /** Counts within the current search and location, per status tab. */
  counts: Record<StatusFilter, number>;
  locations: { id: string; name: string }[];
  onChange: (filters: InventoryFilters) => void;
}

export function InventoryFiltersBar({ filters, counts, locations, onChange }: InventoryFiltersBarProps) {
  return (
    <div className="border-b border-border">
      <div role="group" aria-label="Stock status" className="flex gap-1 overflow-x-auto px-3 pt-3 pb-2">
        {STATUS_FILTERS.map((status) => {
          const active = filters.status === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, status })}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${focusRingClass} ${
                active
                  ? "bg-surface-selected font-semibold text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {STATUS_FILTER_LABELS[status]}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-surface text-foreground" : "bg-surface-muted"}`}
              >
                {formatUnits(counts[status])}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search inventory</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Search product, variant, SKU or location"
            className={`${inputClass} pl-9`}
          />
        </label>
        <label className="sm:w-56">
          <span className="sr-only">Location</span>
          <select
            value={filters.locationId ?? ""}
            onChange={(event) => onChange({ ...filters, locationId: event.target.value || null })}
            className={inputClass}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

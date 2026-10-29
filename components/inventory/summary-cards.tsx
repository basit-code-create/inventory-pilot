import type { InventorySummary, StatusFilter } from "@/lib/inventory/dashboard";
import { formatMoney, formatUnits, plural } from "@/lib/inventory/format";
import { cardClass, focusRingClass } from "@/components/ui/styles";

interface SummaryCardsProps {
  summary: InventorySummary;
  activeStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
}

export function SummaryCards({ summary, activeStatus, onSelectStatus }: SummaryCardsProps) {
  const cards = [
    {
      status: "all",
      label: "Tracked variants",
      value: summary.trackedVariants,
      detail: `${plural(summary.stockLevels, "stock level")} across ${plural(summary.locations, "location")}`,
      dot: "bg-foreground",
    },
    {
      status: "low_stock",
      label: "Low stock",
      value: summary.lowStock,
      detail: "At or below the reorder point",
      dot: "bg-warning-fg",
    },
    {
      status: "out_of_stock",
      label: "Out of stock",
      value: summary.outOfStock,
      detail: "Nothing available to sell",
      dot: "bg-critical-fg",
    },
    {
      status: "needs_reorder",
      label: "Needs reorder",
      value: summary.needsReorder,
      detail: `${plural(summary.recommendedUnits, "unit")} recommended${
        summary.recommendedValue ? ` · ≈ ${formatMoney(summary.recommendedValue)} at cost` : ""
      }`,
      dot: "bg-info-fg",
    },
  ] satisfies { status: StatusFilter; label: string; value: number; detail: string; dot: string }[];

  return (
    <section aria-label="Inventory summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.status}
          type="button"
          aria-pressed={activeStatus === card.status}
          onClick={() => onSelectStatus(card.status)}
          className={`${cardClass} ${focusRingClass} p-4 text-left transition-shadow hover:shadow-md aria-pressed:ring-2 aria-pressed:ring-foreground/80`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-muted">
            <span aria-hidden="true" className={`size-2 rounded-full ${card.dot}`} />
            {card.label}
          </span>
          <span className="mt-2 block text-3xl font-semibold tracking-tight tabular-nums">
            {formatUnits(card.value)}
          </span>
          <span className="mt-1 block text-xs text-muted">{card.detail}</span>
        </button>
      ))}
    </section>
  );
}

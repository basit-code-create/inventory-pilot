import type { StockStatus } from "@/lib/inventory/dashboard";

export const STATUS_LABELS: Record<StockStatus, string> = {
  out_of_stock: "Out of stock",
  low_stock: "Low stock",
  in_stock: "In stock",
};

const STATUS_CLASSES: Record<StockStatus, string> = {
  out_of_stock: "bg-critical-bg text-critical-fg",
  low_stock: "bg-warning-bg text-warning-fg",
  in_stock: "bg-success-bg text-success-fg",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Only shown for data that was actually read from Shopify in this session. */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info-fg">
      Live data
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-caution-badge px-2 py-0.5 text-xs font-semibold text-caution-fg">
      Demo data
    </span>
  );
}

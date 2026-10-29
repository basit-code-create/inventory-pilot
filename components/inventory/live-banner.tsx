import { formatTime, formatUnits, plural } from "@/lib/inventory/format";
import type { InventorySnapshot, SalesHistory } from "@/lib/inventory/types";
import { MAX_SYNCED_LEVELS } from "@/lib/shopify/shared";
import { InfoIcon } from "@/components/ui/icons";

export type SalesState =
  | { status: "loading" }
  | { status: "ready"; history: SalesHistory }
  | { status: "not_approved"; message: string }
  | { status: "error"; message: string };

interface LiveBannerProps {
  shopName: string;
  snapshot: InventorySnapshot | null;
  sales: SalesState;
  syncing: boolean;
}

function demandNote(sales: SalesState): string {
  switch (sales.status) {
    case "loading":
      return "Reading recent orders to work out demand…";
    case "ready":
      return `Average daily demand comes from the last ${sales.history.windowDays} days of orders (${plural(sales.history.ordersCounted, "order")}), unless you set it yourself.`;
    case "not_approved":
      return "Shopify hasn't approved access to orders yet, so average daily demand comes from your reorder rules.";
    case "error":
      return `Recent orders couldn't be read (${sales.message}), so average daily demand comes from your reorder rules.`;
  }
}

export function LiveBanner({ shopName, snapshot, sales, syncing }: LiveBannerProps) {
  return (
    <section
      aria-labelledby="live-banner-title"
      aria-busy={syncing}
      className="flex gap-3 rounded-xl border border-info-bg bg-info-bg/40 p-4 text-info-fg"
    >
      <InfoIcon width={20} height={20} className="mt-px shrink-0" />
      <div className="text-sm">
        <h2 id="live-banner-title" className="font-semibold">
          Live inventory from {shopName}
        </h2>
        <p className="mt-0.5">
          {syncing
            ? "Syncing stock levels from Shopify…"
            : snapshot
              ? `Stock levels come straight from Shopify. Last synced at ${formatTime(snapshot.loadedAt)}: ${plural(snapshot.levels.length, "stock level")} across ${plural(snapshot.locationCount ?? 0, "location")}.`
              : "Stock levels come straight from Shopify."}{" "}
          {demandNote(sales)}
        </p>
        {snapshot?.truncated && !syncing && (
          <p className="mt-2 font-medium">
            Your store has more than {formatUnits(MAX_SYNCED_LEVELS)} stock levels, so some items are missing from this
            sync.
          </p>
        )}
        {sales.status === "ready" && sales.history.truncated && (
          <p className="mt-2 font-medium">
            Not every recent order could be read, so sales-based demand may be a little low.
          </p>
        )}
      </div>
    </section>
  );
}

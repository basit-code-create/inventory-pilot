import { needsReorder } from "@/lib/inventory/dashboard";
import { cardClass } from "@/components/ui/styles";
import { IdleStockPanel } from "../idle-stock";
import { PurchaseList } from "../purchase-list";
import type { InventoryData } from "../use-inventory-data";

/** What to buy, by supplier, and what not to: stock that isn't selling. */
export function PurchaseTab({ data }: { data: InventoryData }) {
  const { items, idle, sales } = data;
  const hasReorders = items.some(needsReorder);

  return (
    <div className="flex flex-col gap-4">
      {hasReorders ? (
        <PurchaseList items={items} />
      ) : (
        <section className={`${cardClass} px-6 py-12 text-center`}>
          <h2 className="text-base font-semibold">Nothing to reorder</h2>
          <p className="mt-1 text-sm text-muted">Every item is above its reorder point.</p>
        </section>
      )}
      {sales.status === "ready" && <IdleStockPanel idle={idle} windowDays={sales.history.windowDays} />}
    </div>
  );
}

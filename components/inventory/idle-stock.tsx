import type { IdleStock } from "@/lib/inventory/insights";
import { formatMoney, formatUnits, formatVariantTitle, plural } from "@/lib/inventory/format";
import { cardClass } from "@/components/ui/styles";

const SHOWN_ITEMS = 10;

/** Stock that hasn't sold in the sales window: money tied up on the shelf. */
export function IdleStockPanel({ idle, windowDays }: { idle: IdleStock; windowDays: number }) {
  if (idle.items.length === 0) return null;

  return (
    <section aria-labelledby="idle-stock-heading" className={`${cardClass} overflow-hidden`}>
      <div className="px-4 pt-4 pb-3">
        <h2 id="idle-stock-heading" className="text-sm font-semibold">
          Not selling
        </h2>
        <p className="mt-0.5 text-sm">
          {plural(idle.items.length, "item")} with {plural(idle.units, "unit")} in stock had no sales in the last{" "}
          {windowDays} days
          {idle.value && (
            <>
              {" "}
              · <span className="font-semibold">{formatMoney(idle.value)}</span> tied up at cost
            </>
          )}
          .
        </p>
        <p className="mt-0.5 text-xs text-muted">Worth a discount or bundle, and not worth reordering yet.</p>
      </div>
      <ul className="divide-y divide-border border-t border-border text-sm">
        {idle.items.slice(0, SHOWN_ITEMS).map((item) => (
          <li key={item.level.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5">
            <span className="min-w-0">
              {item.level.productTitle}{" "}
              <span className="text-muted">
                · {formatVariantTitle(item.level.variantTitle)} · {item.level.locationName}
              </span>
            </span>
            <span className="text-xs whitespace-nowrap text-muted tabular-nums">
              {formatUnits(item.level.available)} in stock
              {item.level.unitCost &&
                ` · ${formatMoney({ ...item.level.unitCost, amount: item.level.unitCost.amount * item.level.available })}`}
            </span>
          </li>
        ))}
      </ul>
      {idle.items.length > SHOWN_ITEMS && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          And {plural(idle.items.length - SHOWN_ITEMS, "more item")}.
        </p>
      )}
    </section>
  );
}

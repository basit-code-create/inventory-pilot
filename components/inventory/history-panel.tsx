"use client";

import { useEffect, useState } from "react";
import { formatDemand, formatUnits, formatVariantTitle, plural } from "@/lib/inventory/format";
import type { HistoryEntry } from "@/lib/inventory/history";
import { loadHistory } from "@/lib/inventory/live-loader";
import { cardClass } from "@/components/ui/styles";

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: HistoryEntry[] }
  | { status: "error"; message: string };

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const TRIGGER_LABELS: Record<HistoryEntry["trigger"], { label: string; className: string }> = {
  sync: { label: "Sync", className: "bg-surface-selected text-foreground" },
  stock_change: { label: "Stock change", className: "bg-warning-bg text-warning-fg" },
};

function entrySummary(entry: HistoryEntry): string {
  if (entry.trigger === "stock_change" && entry.items[0]) {
    const item = entry.items[0];
    return `${item.productTitle} · ${formatVariantTitle(item.variantTitle)} at ${item.locationName} now needs ${plural(item.recommendedQuantity, "unit")}`;
  }
  return `${plural(entry.summary.needsReorder, "item")} to reorder · ${plural(entry.summary.recommendedUnits, "unit")} recommended`;
}

/** Past recommendations from syncs and stock-change webhooks, as they were at the time. */
export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  useEffect(() => {
    let ignore = false;
    loadHistory().then(
      ({ entries }) => {
        if (!ignore) setState({ status: "ready", entries });
      },
      (error: unknown) => {
        if (!ignore) setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error." });
      },
    );
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  return (
    <section aria-labelledby="history-heading" className={`${cardClass} overflow-hidden`}>
      <div className="px-4 pt-4 pb-3">
        <h2 id="history-heading" className="text-sm font-semibold">
          Recommendation history
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Saved each time you sync, and when a stock change makes an item need a reorder. Kept for 180 days.
        </p>
      </div>

      {state.status === "loading" && <p className="border-t border-border px-4 py-4 text-sm text-muted">Loading history…</p>}
      {state.status === "error" && (
        <p role="alert" className="border-t border-border px-4 py-4 text-sm text-critical-fg">
          Couldn&apos;t load the history: {state.message}
        </p>
      )}
      {state.status === "ready" && state.entries.length === 0 && (
        <p className="border-t border-border px-4 py-4 text-sm text-muted">No history yet. It starts with your next sync.</p>
      )}
      {state.status === "ready" && state.entries.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {state.entries.map((entry) => {
            const trigger = TRIGGER_LABELS[entry.trigger];
            return (
              <li key={entry.id ?? entry.createdAt}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-surface-hover">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${trigger.className}`}>{trigger.label}</span>
                    <span className="text-xs text-muted tabular-nums">{dateTimeFormat.format(new Date(entry.createdAt))}</span>
                    <span className="min-w-0 flex-1">{entrySummary(entry)}</span>
                    <span aria-hidden="true" className="text-xs text-muted group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  {entry.items.length === 0 ? (
                    <p className="px-4 pb-3 text-xs text-muted">Nothing needed a reorder.</p>
                  ) : (
                    <div className="overflow-x-auto px-4 pb-3">
                      <table className="w-full text-xs">
                        <thead className="text-left text-muted">
                          <tr>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Item</th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">Location</th>
                            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Available</th>
                            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Incoming</th>
                            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Demand</th>
                            <th scope="col" className="py-1.5 text-right font-medium">Order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {entry.items.map((item) => (
                            <tr key={item.levelId}>
                              <td className="py-1.5 pr-3">
                                {item.productTitle}{" "}
                                <span className="text-muted">· {formatVariantTitle(item.variantTitle)}</span>
                              </td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">{item.locationName}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{formatUnits(item.available)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{formatUnits(item.incoming)}</td>
                              <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
                                {formatDemand(item.averageDailyDemand)}/day
                              </td>
                              <td className="py-1.5 text-right font-semibold tabular-nums">
                                {formatUnits(item.recommendedQuantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {entry.itemsTruncated && (
                        <p className="mt-2 text-xs text-muted">Only the first 500 items were kept for this entry.</p>
                      )}
                    </div>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

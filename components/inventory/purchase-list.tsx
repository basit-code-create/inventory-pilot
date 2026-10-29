"use client";

import { useMemo } from "react";
import { orderValue, type DashboardItem } from "@/lib/inventory/dashboard";
import { formatMoney, formatUnits, formatVariantTitle, plural } from "@/lib/inventory/format";
import { purchaseListByVendor, purchaseListCsv } from "@/lib/inventory/insights";
import { Button } from "@/components/ui/button";
import { cardClass } from "@/components/ui/styles";

/** Starts a browser download of the CSV; nothing is sent anywhere. */
function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What to order, grouped by the product's vendor, ready to send to each supplier. */
export function PurchaseList({ items }: { items: readonly DashboardItem[] }) {
  const groups = useMemo(() => purchaseListByVendor(items), [items]);
  if (groups.length === 0) return null;

  const fileName = `purchase-list-${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <section aria-labelledby="purchase-list-heading" className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="purchase-list-heading" className="text-sm font-semibold">
            By vendor
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Everything to reorder, grouped by the vendor set on each product in Shopify.
          </p>
        </div>
        <Button variant="primary" onClick={() => downloadCsv(purchaseListCsv(groups), fileName)} className="self-start">
          Download CSV
        </Button>
      </div>

      <div className="divide-y divide-border border-t border-border">
        {groups.map((group) => (
          <details key={group.vendor} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-surface-hover">
              <span className="font-medium">{group.vendor}</span>
              <span className="text-xs text-muted">
                {plural(group.items.length, "item")} · {plural(group.units, "unit")}
                {group.value && ` · ≈ ${formatMoney(group.value)}`}
                {group.itemsWithoutCost > 0 && ` (${plural(group.itemsWithoutCost, "item")} without a cost)`}
              </span>
              <span aria-hidden="true" className="ml-auto text-xs text-muted group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-xs">
                <thead className="text-left text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Item</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">SKU</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Location</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">Order</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {group.items.map((item) => {
                    const value = orderValue(item);
                    return (
                      <tr key={item.level.id}>
                        <td className="py-1.5 pr-3">
                          {item.level.productTitle}{" "}
                          <span className="text-muted">· {formatVariantTitle(item.level.variantTitle)}</span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono">{item.level.sku ?? "–"}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{item.level.locationName}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                          {formatUnits(item.reorder?.recommendedQuantity ?? 0)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{value ? formatMoney(value) : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

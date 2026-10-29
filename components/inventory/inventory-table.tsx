import { isCoveredByIncoming, orderValue, type DashboardItem } from "@/lib/inventory/dashboard";
import { formatDemand, formatMoney, formatRunsOut, formatUnits, formatVariantTitle } from "@/lib/inventory/format";
import type { DataSource } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { EditIcon } from "@/components/ui/icons";
import { focusRingClass } from "@/components/ui/styles";
import { StatusBadge } from "./status-badge";

interface InventoryTableProps {
  items: DashboardItem[];
  source: DataSource;
  onEditRule: (levelId: string) => void;
}

function describeItem({ level }: DashboardItem): string {
  return `${level.productTitle}, ${formatVariantTitle(level.variantTitle)}, at ${level.locationName}`;
}

function Quantity({ value }: { value: number }) {
  if (value < 0) {
    return (
      <span className="font-medium text-critical-fg" title="Oversold">
        {formatUnits(value)}
        <span className="sr-only"> (oversold)</span>
      </span>
    );
  }
  return <span className={value === 0 ? "text-subtle" : ""}>{formatUnits(value)}</span>;
}

function Sku({ sku }: { sku: string | null }) {
  return sku ? (
    <span className="font-mono text-xs">{sku}</span>
  ) : (
    <span className="text-xs text-subtle">No SKU</span>
  );
}

function CustomRuleTag() {
  return (
    <span className="rounded bg-surface-selected px-1.5 py-px text-[11px] font-medium text-muted">Custom rule</span>
  );
}

const DEMAND_SOURCE_LABELS: Record<DashboardItem["demandSource"], string> = {
  sales: "from sales",
  manual: "set by you",
  default: "default",
};

function ReorderPoint({ item }: { item: DashboardItem }) {
  if (!item.reorder) return <span className="text-subtle">–</span>;
  return (
    <>
      {formatUnits(item.reorder.reorderPoint)}
      {item.reorder.reorderPointSource === "manual" && (
        <span className="ml-1 text-[11px] text-subtle" title="Set manually instead of calculated">
          manual
        </span>
      )}
      {item.reorder.reorderPointSource === "calculated" && (
        <span className="block text-[11px] whitespace-nowrap text-subtle">
          {formatDemand(item.rule.averageDailyDemand)}/day {DEMAND_SOURCE_LABELS[item.demandSource]}
        </span>
      )}
    </>
  );
}

/** The status badge, with when stock runs out at the current demand. */
function StockStatus({ item }: { item: DashboardItem }) {
  return (
    <div className="flex flex-col items-start gap-0.5 lg:items-start">
      <StatusBadge status={item.status} />
      {item.daysOfCover !== null && item.daysOfCover > 0 && (
        <span className="text-[11px] whitespace-nowrap text-muted">{formatRunsOut(item.daysOfCover)}</span>
      )}
    </div>
  );
}

function Recommendation({ item, onEdit }: { item: DashboardItem; onEdit: () => void }) {
  const { reorder } = item;

  if (item.stockError) {
    return (
      <span className="text-xs text-critical-fg" title={item.stockError}>
        Stock data invalid
      </span>
    );
  }
  if (!reorder) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={`rounded text-sm font-medium text-warning-fg underline underline-offset-2 ${focusRingClass}`}
      >
        Fix rule
      </button>
    );
  }
  if (reorder.shouldReorder) {
    const value = orderValue(item);
    return (
      <div className="flex flex-col items-start lg:items-end">
        <span className="rounded-md bg-info-bg px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-info-fg tabular-nums">
          Order {formatUnits(reorder.recommendedQuantity)}
        </span>
        <span className="mt-0.5 text-[11px] whitespace-nowrap text-muted">
          to reach {formatUnits(item.rule.targetStock)}
          {value && ` · ≈ ${formatMoney(value)}`}
        </span>
      </div>
    );
  }
  if (isCoveredByIncoming(item)) {
    return <span className="text-xs whitespace-nowrap text-info-fg">Covered by incoming</span>;
  }
  return (
    <span className="text-subtle">
      –<span className="sr-only">No reorder needed</span>
    </span>
  );
}

export function InventoryTable({ items, source, onEditRule }: InventoryTableProps) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Inventory by variant and location ({source === "demo" ? "demo data" : "Shopify data"})
          </caption>
          <thead className="border-b border-border bg-surface-muted text-left text-xs font-medium text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
              <th scope="col" className="px-3 py-2.5 font-medium">SKU</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Location</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Available</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Incoming</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Reorder point</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Recommended</th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const { level } = item;
              const edit = () => onEditRule(level.id);
              return (
                <tr key={level.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="font-medium">{level.productTitle}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {formatVariantTitle(level.variantTitle)}
                      {item.hasCustomRule && <CustomRuleTag />}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Sku sku={level.sku} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{level.locationName}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Quantity value={level.available} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Quantity value={level.incoming} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                    <ReorderPoint item={item} />
                  </td>
                  <td className="px-3 py-3">
                    <StockStatus item={item} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Recommendation item={item} onEdit={edit} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={edit}
                      aria-label={`Edit reorder rule for ${describeItem(item)}`}
                      title="Edit reorder rule"
                      className={`rounded-md p-1.5 text-muted hover:bg-surface-selected hover:text-foreground ${focusRingClass}`}
                    >
                      <EditIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border lg:hidden" aria-label="Inventory by variant and location">
        {items.map((item) => {
          const { level } = item;
          const edit = () => onEditRule(level.id);
          return (
            <li key={level.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{level.productTitle}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                    {formatVariantTitle(level.variantTitle)}
                    <span aria-hidden="true">·</span>
                    <Sku sku={level.sku} />
                    {item.hasCustomRule && <CustomRuleTag />}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{level.locationName}</p>
                </div>
                <StockStatus item={item} />
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-muted p-2.5 text-center">
                <div>
                  <dt className="text-[11px] text-muted">Available</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    <Quantity value={level.available} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Incoming</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    <Quantity value={level.incoming} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Reorder point</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    <ReorderPoint item={item} />
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3">
                <Recommendation item={item} onEdit={edit} />
                <Button onClick={edit} aria-label={`Edit reorder rule for ${describeItem(item)}`}>
                  <EditIcon />
                  Edit rule
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

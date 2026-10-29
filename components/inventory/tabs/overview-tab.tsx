import { needsReorder, orderValue, type StatusFilter } from "@/lib/inventory/dashboard";
import { formatMoney, formatRunsOut, formatTime, formatUnits, formatVariantTitle, plural } from "@/lib/inventory/format";
import { MAX_SYNCED_LEVELS } from "@/lib/shopify/shared";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { cardClass } from "@/components/ui/styles";
import { connectionProblems } from "@/components/shopify/connection-status";
import { SummaryCards } from "../summary-cards";
import type { InventoryData, SalesState } from "../use-inventory-data";
import type { TabId } from "../inventory-app";

const REORDER_PREVIEW = 6;

interface OverviewTabProps {
  data: InventoryData;
  onNavigate: (tab: TabId) => void;
  onShowInventory: (status: StatusFilter) => void;
}

function CardHeader({ id, title, description }: { id?: string; title: string; description?: string }) {
  return (
    <div className="px-4 pt-4 pb-3">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
    </div>
  );
}

function ReorderNow({ data, onNavigate }: Pick<OverviewTabProps, "data" | "onNavigate">) {
  const reorderItems = data.items.filter(needsReorder);
  const shown = reorderItems.slice(0, REORDER_PREVIEW);

  return (
    <section aria-labelledby="reorder-now-heading" className={`${cardClass} overflow-hidden`}>
      <div className="px-4 pt-4 pb-3">
        <h2 id="reorder-now-heading" className="text-sm font-semibold">
          Reorder now
        </h2>
        <p className="mt-0.5 text-xs text-muted">The items closest to running out, most urgent first.</p>
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-border px-4 py-8 text-center text-sm text-muted">Nothing needs a reorder right now.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.map((item) => {
            const value = orderValue(item);
            return (
              <li key={item.level.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.level.productTitle}</p>
                  <p className="truncate text-xs text-muted">
                    {formatVariantTitle(item.level.variantTitle)} · {item.level.locationName}
                    {item.daysOfCover !== null && ` · ${formatRunsOut(item.daysOfCover)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">Order {formatUnits(item.reorder?.recommendedQuantity ?? 0)}</p>
                  {value && <p className="text-xs text-muted tabular-nums">≈ {formatMoney(value)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reorderItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            {reorderItems.length > REORDER_PREVIEW
              ? `Showing ${REORDER_PREVIEW} of ${plural(reorderItems.length, "item")}`
              : plural(reorderItems.length, "item")}
          </p>
          <Button variant="primary" onClick={() => onNavigate("purchase-list")}>
            Open purchase list
          </Button>
        </div>
      )}
    </section>
  );
}

function demandNote(sales: SalesState, live: boolean): string {
  if (!live) return "From the sample rules";
  switch (sales.status) {
    case "loading":
      return "Reading recent orders…";
    case "ready":
      return sales.history.ordersCounted === 0
        ? `No orders in the last ${sales.history.windowDays} days, so from your rules`
        : `Last ${sales.history.windowDays} days of orders (${plural(sales.history.ordersCounted, "order")})`;
    case "not_approved":
      return "From your rules (orders access not approved)";
    case "error":
      return "From your rules (orders couldn't be read)";
  }
}

function DataStatus({ data }: { data: InventoryData }) {
  const { snapshot, sales, connection, reorderOptions, summary } = data;
  const live = data.mode === "live";
  const rows: [string, string][] = [
    ["Source", live && connection.status === "connected" ? `Shopify · ${connection.shopName}` : "Sample data"],
    ["Last synced", snapshot ? formatTime(snapshot.loadedAt) : "–"],
    ["Tracked stock", `${plural(summary.stockLevels, "level")} across ${plural(summary.locations, "location")}`],
    ["Demand", demandNote(sales, live)],
    ["Incoming stock", reorderOptions.incomingStock === "include" ? "Counted" : "Ignored"],
  ];

  return (
    <section aria-labelledby="data-status-heading" className={cardClass}>
      <CardHeader id="data-status-heading" title="Data" />
      <dl className="divide-y divide-border border-t border-border px-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {snapshot?.truncated && (
        <p className="border-t border-border px-4 py-3 text-xs text-warning-fg">
          Only the first {formatUnits(MAX_SYNCED_LEVELS)} stock levels were synced.
        </p>
      )}
      {sales.status === "ready" && sales.history.truncated && (
        <p className="border-t border-border px-4 py-3 text-xs text-warning-fg">
          Not every recent order could be read, so demand may be a little low.
        </p>
      )}
    </section>
  );
}

function NotSelling({ data, onNavigate }: Pick<OverviewTabProps, "data" | "onNavigate">) {
  const { idle } = data;
  if (idle.items.length === 0) return null;
  return (
    <section className={cardClass}>
      <CardHeader title="Not selling" />
      <div className="border-t border-border px-4 py-3 text-sm">
        <p>
          <span className="font-semibold">{plural(idle.items.length, "item")}</span> had no sales
          {idle.value && (
            <>
              {" "}
              · <span className="font-semibold">{formatMoney(idle.value)}</span> tied up
            </>
          )}
        </p>
        <Button variant="plain" className="-ml-1.5 mt-1" onClick={() => onNavigate("purchase-list")}>
          See the list
        </Button>
      </div>
    </section>
  );
}

export function OverviewTab({ data, onNavigate, onShowInventory }: OverviewTabProps) {
  const problems = connectionProblems(data.connection);
  return (
    <div className="flex flex-col gap-4">
      {problems.length > 0 && (
        <Banner
          tone="warning"
          title={`The Shopify connection needs attention (${problems.length})`}
          actions={<Button onClick={() => onNavigate("settings")}>Review</Button>}
        >
          Some automatic features may be off. Details are in Settings.
        </Banner>
      )}

      <SummaryCards summary={data.summary} onSelectStatus={onShowInventory} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ReorderNow data={data} onNavigate={onNavigate} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <DataStatus data={data} />
          <NotSelling data={data} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

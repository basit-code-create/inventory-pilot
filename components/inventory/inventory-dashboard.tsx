"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildDashboardItems,
  countByStatus,
  DEFAULT_FILTERS,
  filterItems,
  listLocations,
  summarizeInventory,
  type InventoryFilters,
  type StatusFilter,
} from "@/lib/inventory/dashboard";
import { demandFromSales } from "@/lib/inventory/demand";
import { idleStock } from "@/lib/inventory/insights";
import { DEMO_RULE_OVERRIDES, loadDemoInventory, type DemoScenario } from "@/lib/inventory/demo-data";
import { formatTime, formatUnits, plural } from "@/lib/inventory/format";
import {
  loadSettings,
  resetSettings as resetSettingsRequest,
  saveDefaults as saveDefaultsRequest,
  saveItemRule as saveItemRuleRequest,
  syncLiveData,
} from "@/lib/inventory/live-loader";
import { showToast } from "@/lib/shopify/app-bridge-client";
import type { SalesHistoryResponse } from "@/lib/shopify/shared";
import { DEFAULT_REORDER_OPTIONS, type ReorderOptions } from "@/lib/inventory/reorder";
import { DEFAULT_REORDER_RULE } from "@/lib/inventory/rules";
import type { InventorySnapshot, ReorderRule, ReorderRuleOverride, RuleOverrides } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { RefreshIcon, SlidersIcon } from "@/components/ui/icons";
import { cardClass } from "@/components/ui/styles";
import { ConnectionBadge, ConnectionNotice } from "@/components/shopify/connection-status";
import { useShopifyConnection, type ShopifyConnection } from "@/components/shopify/use-shopify-connection";
import { DashboardSkeleton, EmptyState, ErrorState, NoResults } from "./dashboard-states";
import { DefaultRuleCard } from "./default-rule-card";
import { DefaultRuleDialog } from "./default-rule-dialog";
import { DemoBanner } from "./demo-banner";
import { InventoryFiltersBar } from "./inventory-filters";
import { InventoryTable } from "./inventory-table";
import { HistoryPanel } from "./history-panel";
import { IdleStockPanel } from "./idle-stock";
import { ItemRuleDialog } from "./item-rule-dialog";
import { LiveBanner, type SalesState } from "./live-banner";
import { PurchaseList } from "./purchase-list";
import { DemoBadge, LiveBadge } from "./status-badge";
import { SummaryCards } from "./summary-cards";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: InventorySnapshot };

/**
 * live: embedded in the Shopify admin with a verified connection, so inventory is read from Shopify.
 * demo: opened outside the admin, so there is no store and sample data is shown instead.
 * pending / unavailable: still checking, or the connection failed; neither kind of data is shown.
 */
type DataMode = "pending" | "live" | "demo" | "unavailable";

function toSalesState(sales: SalesHistoryResponse): SalesState {
  return sales.status === "ok" ? { status: "ready", history: sales } : sales;
}

function dataModeFor(connection: ShopifyConnection): DataMode {
  switch (connection.status) {
    case "connected":
      return "live";
    case "not_embedded":
      return "demo";
    case "checking":
      return "pending";
    case "error":
      return "unavailable";
  }
}

export function InventoryDashboard() {
  const { connection, recheck } = useShopifyConnection();
  const mode = dataModeFor(connection);
  const [scenario, setScenario] = useState<DemoScenario>("normal");
  const [loadCount, setLoadCount] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [defaults, setDefaults] = useState<ReorderRule>(DEFAULT_REORDER_RULE);
  const [reorderOptions, setReorderOptions] = useState<ReorderOptions>(DEFAULT_REORDER_OPTIONS);
  const [sales, setSales] = useState<SalesState>({ status: "loading" });
  // Sample rules only make sense for sample data; live items start on the default rule.
  const [demoOverrides, setDemoOverrides] = useState<RuleOverrides>(DEMO_RULE_OVERRIDES);
  const [liveOverrides, setLiveOverrides] = useState<RuleOverrides>({});
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const overrides = mode === "live" ? liveOverrides : demoOverrides;
  const setOverrides = mode === "live" ? setLiveOverrides : setDemoOverrides;

  useEffect(() => {
    if (mode !== "live" && mode !== "demo") return;
    let ignore = false;
    const fail = (error: unknown) => {
      if (!ignore) setLoad({ status: "error", message: error instanceof Error ? error.message : "Unknown error." });
    };

    if (mode === "demo") {
      loadDemoInventory(scenario).then((snapshot) => {
        if (!ignore) setLoad({ status: "ready", snapshot });
      }, fail);
    } else {
      // Saved rules arrive with every sync, so the screen uses the same rules the server recorded in the history.
      Promise.all([syncLiveData(), loadSettings()]).then(([result, settings]) => {
        if (ignore) return;
        setDefaults(settings.defaults);
        setReorderOptions(settings.options);
        setLiveOverrides(settings.overrides);
        setSales(toSalesState(result.sales));
        setLoad({ status: "ready", snapshot: result.snapshot });
        setHistoryKey((key) => key + 1);
      }, fail);
    }
    return () => {
      ignore = true;
    };
  }, [mode, scenario, loadCount]);

  const snapshot = load.status === "ready" ? load.snapshot : null;
  const salesDemand = useMemo(
    () => (mode === "live" && snapshot && sales.status === "ready" ? demandFromSales(snapshot.levels, sales.history) : null),
    [mode, snapshot, sales],
  );
  const items = useMemo(
    () =>
      snapshot ? buildDashboardItems(snapshot.levels, defaults, overrides, { ...reorderOptions, salesDemand }) : [],
    [snapshot, defaults, overrides, reorderOptions, salesDemand],
  );
  const summary = useMemo(() => summarizeInventory(items), [items]);
  const idle = useMemo(() => idleStock(items, salesDemand), [items, salesDemand]);
  const locations = useMemo(() => listLocations(items), [items]);
  const visibleItems = useMemo(() => filterItems(items, filters), [items, filters]);
  const statusCounts = useMemo(
    () => countByStatus(filterItems(items, { ...filters, status: "all" })),
    [items, filters],
  );
  const untrackedCount = snapshot ? snapshot.levels.filter((level) => !level.tracked).length : 0;
  const editingItem = items.find((item) => item.level.id === editingId) ?? null;

  function reload(nextScenario: DemoScenario = scenario) {
    setLoad({ status: "loading" });
    setSales({ status: "loading" });
    setScenario(nextScenario);
    setLoadCount((count) => count + 1);
  }

  function selectStatus(status: StatusFilter) {
    // Clicking the active summary card again goes back to showing everything.
    setFilters((current) => ({ ...current, status: current.status === status ? "all" : status }));
  }

  /** Live changes show at once and are saved in the background; a failed save puts the old values back. */
  function persist(request: () => Promise<unknown>, rollback: () => void, savedMessage: string) {
    if (mode !== "live") return;
    request().then(
      () => {
        setSaveError(null);
        showToast(savedMessage);
      },
      (error: unknown) => {
        rollback();
        setSaveError(error instanceof Error ? error.message : "Unknown error.");
        showToast("Couldn't save your change", { isError: true });
      },
    );
  }

  const applyOverride = (levelId: string, override: ReorderRuleOverride | undefined) =>
    setOverrides((current) => {
      const next = { ...current };
      if (!override || Object.keys(override).length === 0) delete next[levelId];
      else next[levelId] = override;
      return next;
    });

  function saveItemRule(levelId: string, override: ReorderRuleOverride) {
    const previous = overrides[levelId];
    applyOverride(levelId, override);
    setEditingId(null);
    persist(() => saveItemRuleRequest(levelId, override), () => applyOverride(levelId, previous), "Rule saved");
  }

  function saveDefaults(rule: ReorderRule, options: ReorderOptions) {
    const previous = { defaults, reorderOptions };
    setDefaults(rule);
    setReorderOptions(options);
    setDefaultsOpen(false);
    persist(
      () => saveDefaultsRequest(rule, options),
      () => {
        setDefaults(previous.defaults);
        setReorderOptions(previous.reorderOptions);
      },
      "Defaults saved",
    );
  }

  function resetRules() {
    const previous = { defaults, reorderOptions, overrides };
    setDefaults(DEFAULT_REORDER_RULE);
    setReorderOptions(DEFAULT_REORDER_OPTIONS);
    setOverrides(mode === "live" ? {} : DEMO_RULE_OVERRIDES);
    setDefaultsOpen(false);
    persist(
      resetSettingsRequest,
      () => {
        setDefaults(previous.defaults);
        setReorderOptions(previous.reorderOptions);
        setOverrides(previous.overrides);
      },
      "Rules reset",
    );
  }

  const usesSalesDemand = salesDemand !== null;

  const loading = load.status === "loading";
  const hasData = mode === "live" || mode === "demo";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Inventory reorder assistant</h1>
            {mode === "live" && <LiveBadge />}
            {mode === "demo" && <DemoBadge />}
            <ConnectionBadge connection={connection} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Recommended reorder quantities for each variant at each location.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDefaultsOpen(true)}>
            <SlidersIcon />
            Reorder defaults
          </Button>
          {mode === "live" && (
            <Button variant="primary" onClick={() => reload()} disabled={loading}>
              <RefreshIcon className={loading ? "animate-spin" : undefined} />
              {loading ? "Syncing…" : "Sync inventory"}
            </Button>
          )}
          {mode === "demo" && (
            <Button onClick={() => reload()} disabled={loading}>
              <RefreshIcon className={loading ? "animate-spin" : undefined} />
              Reload demo data
            </Button>
          )}
        </div>
      </header>

      <ConnectionNotice connection={connection} onRetry={recheck} />

      {saveError && (
        <p role="alert" className="rounded-xl bg-critical-bg/60 px-4 py-3 text-sm text-critical-fg">
          Your last change wasn&apos;t saved, so it was undone: {saveError}
        </p>
      )}

      {mode === "demo" && <DemoBanner scenario={scenario} onScenarioChange={reload} />}
      {mode === "live" && connection.status === "connected" && (
        <LiveBanner shopName={connection.shopName} snapshot={snapshot} sales={sales} syncing={loading} />
      )}

      {(mode === "pending" || (hasData && loading)) && <DashboardSkeleton />}

      {hasData && load.status === "error" && <ErrorState message={load.message} onRetry={() => reload()} />}

      {hasData && load.status === "ready" && items.length === 0 && (
        <EmptyState source={load.snapshot.source} untrackedCount={untrackedCount} />
      )}

      {hasData && load.status === "ready" && items.length > 0 && (
        <>
          <SummaryCards summary={summary} activeStatus={filters.status} onSelectStatus={selectStatus} />

          <PurchaseList items={items} />

          <DefaultRuleCard
            rule={defaults}
            options={reorderOptions}
            usesSalesDemand={usesSalesDemand}
            customRules={summary.customRules}
            totalItems={summary.stockLevels}
            onEdit={() => setDefaultsOpen(true)}
          />

          <section aria-labelledby="inventory-heading" className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col gap-1 px-4 pt-4 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 id="inventory-heading" className="text-sm font-semibold">
                Inventory
              </h2>
              <p className="text-xs text-muted">
                {load.snapshot.source === "live" ? "Synced from Shopify at" : "Demo snapshot loaded at"}{" "}
                {formatTime(load.snapshot.loadedAt)}
              </p>
            </div>

            <InventoryFiltersBar
              filters={filters}
              counts={statusCounts}
              locations={locations}
              onChange={setFilters}
            />

            {visibleItems.length === 0 ? (
              <NoResults onClear={() => setFilters(DEFAULT_FILTERS)} />
            ) : (
              <InventoryTable items={visibleItems} source={load.snapshot.source} onEditRule={setEditingId} />
            )}

            <p className="border-t border-border px-4 py-3 text-xs text-muted">
              Showing {formatUnits(visibleItems.length)} of {plural(items.length, "item")}
              {untrackedCount > 0 && ` · ${plural(untrackedCount, "untracked variant")} not shown`}
              {summary.invalidRules > 0 &&
                ` · ${plural(summary.invalidRules, "rule")} ${summary.invalidRules === 1 ? "needs" : "need"} fixing`}
            </p>
          </section>
        </>
      )}

      {hasData && load.status === "ready" && sales.status === "ready" && (
        <IdleStockPanel idle={idle} windowDays={sales.history.windowDays} />
      )}

      {mode === "live" && load.status === "ready" && <HistoryPanel refreshKey={historyKey} />}

      <DefaultRuleDialog
        open={defaultsOpen}
        rule={defaults}
        options={reorderOptions}
        usesSalesDemand={usesSalesDemand}
        persisted={mode === "live"}
        customRules={summary.customRules}
        onSave={saveDefaults}
        onResetRules={resetRules}
        resetLabel={mode === "live" ? "Reset all rules" : "Reset all demo rules"}
        onClose={() => setDefaultsOpen(false)}
      />

      <ItemRuleDialog
        item={editingItem}
        source={mode === "live" ? "live" : "demo"}
        defaults={defaults}
        override={editingId ? overrides[editingId] : undefined}
        salesDemand={editingId ? (salesDemand?.[editingId] ?? null) : null}
        salesWindowDays={sales.status === "ready" ? sales.history.windowDays : null}
        options={reorderOptions}
        onSave={saveItemRule}
        onClose={() => setEditingId(null)}
      />
    </main>
  );
}

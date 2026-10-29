"use client";

import { useState } from "react";
import { DEFAULT_FILTERS, type InventoryFilters, type StatusFilter } from "@/lib/inventory/dashboard";
import { formatTime } from "@/lib/inventory/format";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { cardClass } from "@/components/ui/styles";
import { Tabs, useHashTab, type TabItem } from "@/components/ui/tabs";
import { ConnectionErrorBanner } from "@/components/shopify/connection-status";
import { DashboardSkeleton, EmptyState, ErrorState } from "./dashboard-states";
import { DemoBanner } from "./demo-banner";
import { HistoryPanel } from "./history-panel";
import { ItemRuleDialog } from "./item-rule-dialog";
import { DemoBadge, LiveBadge } from "./status-badge";
import { InventoryTab } from "./tabs/inventory-tab";
import { OverviewTab } from "./tabs/overview-tab";
import { PurchaseTab } from "./tabs/purchase-tab";
import { SettingsTab } from "./tabs/settings-tab";
import { useInventoryData, type InventoryData } from "./use-inventory-data";

const TAB_IDS = ["overview", "inventory", "purchase-list", "history", "settings"] as const;
export type TabId = (typeof TAB_IDS)[number];

const TAB_TITLES: Record<TabId, string> = {
  overview: "Overview",
  inventory: "Inventory",
  "purchase-list": "Purchase list",
  history: "History",
  settings: "Settings",
};

function StatusLine({ data }: { data: InventoryData }) {
  const { mode, connection, snapshot, loading } = data;
  if (mode === "live" && connection.status === "connected") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <LiveBadge />
        <span>{connection.shopName}</span>
        <span aria-hidden="true">·</span>
        <span>{loading ? "Syncing…" : snapshot ? `Synced ${formatTime(snapshot.loadedAt)}` : "Not synced yet"}</span>
      </p>
    );
  }
  if (mode === "demo") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <DemoBadge />
        <span>Sample products, not your store</span>
      </p>
    );
  }
  return <p className="text-sm text-muted">{mode === "pending" ? "Connecting to Shopify…" : "Not connected"}</p>;
}

/** The app: one page header, Shopify-style tabs, and a panel per tab. Data loads once and is shared by every tab. */
export function InventoryApp() {
  const data = useInventoryData();
  const [tab, setTab] = useHashTab(TAB_IDS, "overview");
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { mode, load, loading, hasData, items } = data;
  const editingItem = items.find((item) => item.level.id === editingId) ?? null;

  const tabs: TabItem<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "inventory", label: "Inventory" },
    { id: "purchase-list", label: "Purchase list", badge: load.status === "ready" ? data.summary.needsReorder : undefined },
    { id: "history", label: "History" },
    { id: "settings", label: "Settings" },
  ];

  function showInventory(status: StatusFilter) {
    setFilters({ ...DEFAULT_FILTERS, status });
    setTab("inventory");
  }

  function renderPanel() {
    if (mode === "unavailable") return null;
    if (mode === "pending" || loading) return <DashboardSkeleton />;
    if (load.status === "error") return <ErrorState message={load.message} onRetry={() => data.reload()} />;
    if (load.status !== "ready") return null;

    if (tab === "settings") return <SettingsTab data={data} />;
    if (tab === "history") {
      return mode === "live" ? (
        <HistoryPanel refreshKey={data.historyKey} />
      ) : (
        <section className={`${cardClass} px-6 py-12 text-center`}>
          <h2 className="text-base font-semibold">History is kept for your store</h2>
          <p className="mt-1 text-sm text-muted">Open InventoryPilot from your Shopify admin to see past recommendations.</p>
        </section>
      );
    }
    if (items.length === 0) return <EmptyState source={load.snapshot.source} untrackedCount={data.untrackedCount} />;
    if (tab === "inventory") {
      return <InventoryTab data={data} filters={filters} onFiltersChange={setFilters} onEditRule={setEditingId} />;
    }
    if (tab === "purchase-list") return <PurchaseTab data={data} />;
    return <OverviewTab data={data} onNavigate={setTab} onShowInventory={showInventory} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{TAB_TITLES[tab]}</h1>
          <div className="mt-1">
            <StatusLine data={data} />
          </div>
        </div>
        {hasData && (
          <Button variant={mode === "live" ? "primary" : "secondary"} onClick={() => data.reload()} disabled={loading} className="self-start sm:self-auto">
            <RefreshIcon className={loading ? "animate-spin" : undefined} />
            {mode === "live" ? (loading ? "Syncing…" : "Sync inventory") : "Reload demo data"}
          </Button>
        )}
      </header>

      <Tabs tabs={tabs} selected={tab} onSelect={setTab} label="InventoryPilot sections" />

      <ConnectionErrorBanner connection={data.connection} onRetry={data.recheck} />
      {data.saveError && (
        <Banner tone="critical" title="Your last change wasn't saved" actions={<Button onClick={data.dismissSaveError}>Dismiss</Button>}>
          It was undone: {data.saveError}
        </Banner>
      )}
      {mode === "demo" && <DemoBanner scenario={data.scenario} onScenarioChange={data.reload} />}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {renderPanel()}
      </div>

      <ItemRuleDialog
        item={editingItem}
        source={mode === "live" ? "live" : "demo"}
        defaults={data.defaults}
        override={editingId ? data.overrides[editingId] : undefined}
        salesDemand={editingId ? (data.salesDemand?.[editingId] ?? null) : null}
        salesWindowDays={data.sales.status === "ready" ? data.sales.history.windowDays : null}
        options={data.reorderOptions}
        onSave={(levelId, override) => {
          data.saveItemRule(levelId, override);
          setEditingId(null);
        }}
        onClose={() => setEditingId(null)}
      />
    </main>
  );
}

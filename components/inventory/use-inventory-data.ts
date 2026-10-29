"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDashboardItems, listLocations, summarizeInventory } from "@/lib/inventory/dashboard";
import { demandFromSales } from "@/lib/inventory/demand";
import { DEMO_RULE_OVERRIDES, loadDemoInventory, type DemoScenario } from "@/lib/inventory/demo-data";
import { idleStock } from "@/lib/inventory/insights";
import {
  loadSettings,
  resetSettings as resetSettingsRequest,
  saveDefaults as saveDefaultsRequest,
  saveItemRule as saveItemRuleRequest,
  syncLiveData,
} from "@/lib/inventory/live-loader";
import { DEFAULT_REORDER_OPTIONS, type ReorderOptions } from "@/lib/inventory/reorder";
import { DEFAULT_REORDER_RULE } from "@/lib/inventory/rules";
import type { InventorySnapshot, ReorderRule, ReorderRuleOverride, RuleOverrides, SalesHistory } from "@/lib/inventory/types";
import { showToast } from "@/lib/shopify/app-bridge-client";
import type { SalesHistoryResponse } from "@/lib/shopify/shared";
import { useShopifyConnection, type ShopifyConnection } from "@/components/shopify/use-shopify-connection";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: InventorySnapshot };

export type SalesState =
  | { status: "loading" }
  | { status: "ready"; history: SalesHistory }
  | { status: "not_approved"; message: string }
  | { status: "error"; message: string };

/**
 * live: embedded in the Shopify admin with a verified connection, so inventory is read from Shopify.
 * demo: opened outside the admin, so there is no store and sample data is shown instead.
 * pending / unavailable: still checking, or the connection failed; neither kind of data is shown.
 */
export type DataMode = "pending" | "live" | "demo" | "unavailable";

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

/** Everything the app's tabs share: the connection, the loaded data, the rules and how to change them. */
export function useInventoryData() {
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
  const untrackedCount = snapshot ? snapshot.levels.filter((level) => !level.tracked).length : 0;

  function reload(nextScenario: DemoScenario = scenario) {
    setLoad({ status: "loading" });
    setSales({ status: "loading" });
    setScenario(nextScenario);
    setLoadCount((count) => count + 1);
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
    persist(() => saveItemRuleRequest(levelId, override), () => applyOverride(levelId, previous), "Rule saved");
  }

  function saveDefaults(rule: ReorderRule, options: ReorderOptions) {
    const previous = { defaults, reorderOptions };
    setDefaults(rule);
    setReorderOptions(options);
    persist(
      () => saveDefaultsRequest(rule, options),
      () => {
        setDefaults(previous.defaults);
        setReorderOptions(previous.reorderOptions);
      },
      "Settings saved",
    );
  }

  function resetRules() {
    const previous = { defaults, reorderOptions, overrides };
    setDefaults(DEFAULT_REORDER_RULE);
    setReorderOptions(DEFAULT_REORDER_OPTIONS);
    setOverrides(mode === "live" ? {} : DEMO_RULE_OVERRIDES);
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

  return {
    connection,
    recheck,
    mode,
    scenario,
    load,
    snapshot,
    sales,
    salesDemand,
    items,
    summary,
    idle,
    locations,
    untrackedCount,
    defaults,
    reorderOptions,
    overrides,
    saveError,
    historyKey,
    loading: load.status === "loading",
    hasData: mode === "live" || mode === "demo",
    reload,
    saveItemRule,
    saveDefaults,
    resetRules,
    dismissSaveError: () => setSaveError(null),
  };
}

export type InventoryData = ReturnType<typeof useInventoryData>;

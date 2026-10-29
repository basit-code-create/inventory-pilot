import "server-only";

import { loadShopSettings, recordHistory, saveLevelStates } from "../db/shop-data";
import { buildDashboardItems } from "../inventory/dashboard";
import { demandFromSales } from "../inventory/demand";
import { buildHistoryEntry } from "../inventory/history";
import { AdminApiError } from "../shopify/admin-graphql";
import type { ShopifyAdminContext } from "../shopify/auth";
import { fetchLiveInventory } from "../shopify/inventory";
import { fetchSalesHistory } from "../shopify/sales";
import type { SalesHistoryResponse, SyncResponse } from "../shopify/shared";

/** Orders are optional: stock still syncs when they can't be read. */
async function readSales(graphql: ShopifyAdminContext["graphql"], windowDays: number): Promise<SalesHistoryResponse> {
  try {
    return { status: "ok", ...(await fetchSalesHistory(graphql, { windowDays })) };
  } catch (error) {
    if (error instanceof AdminApiError && error.code === "ACCESS_DENIED") {
      return { status: "not_approved", message: error.message };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Unknown error." };
  }
}

/**
 * A full sync: reads stock and recent sales from Shopify (read-only), applies the shop's saved
 * rules on the server, and records the resulting recommendations in the history.
 */
export async function runSync(shop: string, graphql: ShopifyAdminContext["graphql"]): Promise<SyncResponse> {
  // Settings come first: they decide how many days of orders to read.
  const settings = await loadShopSettings(shop);
  const [inventory, sales] = await Promise.all([
    fetchLiveInventory(graphql),
    readSales(graphql, settings.options.demandWindowDays),
  ]);

  const loadedAt = new Date();
  const salesDemand = demandFromSales(inventory.levels, sales.status === "ok" ? sales : null);
  const items = buildDashboardItems(inventory.levels, settings.defaults, settings.overrides, {
    ...settings.options,
    salesDemand,
  });

  const entry = buildHistoryEntry(items, "sync", settings.options.incomingStock, loadedAt);
  const [historyId] = await Promise.all([recordHistory(shop, entry), saveLevelStates(shop, items)]);

  return {
    snapshot: {
      source: "live",
      levels: inventory.levels,
      loadedAt: loadedAt.toISOString(),
      locationCount: inventory.locationCount,
      truncated: inventory.truncated,
    },
    sales,
    history: { id: historyId, needsReorder: entry.summary.needsReorder, recommendedUnits: entry.summary.recommendedUnits },
  };
}

import "server-only";

import type { ShopSettings } from "../db/shop-data";
import { buildDashboardItems, needsReorder, type DashboardItem } from "../inventory/dashboard";
import { buildHistoryEntry, type HistoryEntry } from "../inventory/history";
import type { DemandSource } from "../inventory/rules";
import type { ShopifyAdminContext } from "../shopify/auth";
import { toInventoryLevel, type LevelNode } from "../shopify/inventory";

const LEVEL_QUERY = `#graphql
  query InventoryLevelForWebhook($locationId: ID!, $inventoryItemId: ID!) {
    location(id: $locationId) {
      id
      name
      inventoryLevel(inventoryItemId: $inventoryItemId) {
        quantities(names: ["available", "incoming"]) {
          name
          quantity
        }
        item {
          id
          sku
          tracked
          unitCost {
            amount
            currencyCode
          }
          variants(first: 1) {
            nodes {
              id
              title
              product {
                id
                title
                status
                vendor
              }
            }
          }
        }
      }
    }
  }
`;

interface LevelData {
  location: { id: string; name: string; inventoryLevel: LevelNode | null } | null;
}

export interface InventoryUpdate {
  inventoryItemId: string;
  locationId: string;
  updatedAt: Date | null;
}

/** The inventory_levels/update payload uses numeric REST IDs; the Admin API needs GIDs. */
export function parseInventoryUpdate(payload: unknown): InventoryUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const { inventory_item_id: itemId, location_id: locationId, updated_at: updatedAt } = payload as Record<string, unknown>;
  const isId = (value: unknown) => (typeof value === "number" || typeof value === "string") && /^\d+$/.test(String(value));
  if (!isId(itemId) || !isId(locationId)) return null;

  const parsedDate = typeof updatedAt === "string" ? new Date(updatedAt) : null;
  return {
    inventoryItemId: `gid://shopify/InventoryItem/${itemId}`,
    locationId: `gid://shopify/Location/${locationId}`,
    updatedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
  };
}

export interface LevelState {
  averageDailyDemand: number;
  demandSource: DemandSource;
  needsReorder: boolean;
  shopifyUpdatedAt: Date | null;
}

export interface InventoryUpdateDeps {
  graphql: ShopifyAdminContext["graphql"];
  loadSettings: (shop: string) => Promise<ShopSettings>;
  getLevelState: (shop: string, levelId: string) => Promise<LevelState | null>;
  /**
   * Saves the new state and returns the one it replaced, atomically. Not applied if a newer or
   * equal Shopify update is already saved.
   */
  swapLevelState: (
    shop: string,
    item: DashboardItem,
    shopifyUpdatedAt: Date | null,
  ) => Promise<{ applied: false } | { applied: true; previous: LevelState | null }>;
  recordHistory: (shop: string, entry: HistoryEntry) => Promise<unknown>;
  now?: () => Date;
}

/**
 * ignored: malformed payload, or the item isn't tracked or sold any more.
 * stale: an older or repeated update than one already applied.
 * updated: the recommendation was refreshed.
 * now_needs_reorder: the item has just crossed its reorder point, so it was added to the history.
 */
export type InventoryUpdateOutcome = "ignored" | "stale" | "updated" | "now_needs_reorder";

/**
 * Handles inventory_levels/update. Shopify stays the source of truth: the level is re-read from
 * the Admin API rather than trusted from the payload. Safe to run twice for the same update.
 */
export async function processInventoryUpdate(
  shop: string,
  payload: unknown,
  deps: InventoryUpdateDeps,
): Promise<InventoryUpdateOutcome> {
  const update = parseInventoryUpdate(payload);
  if (!update) return "ignored";

  const { data } = await deps.graphql<LevelData>(LEVEL_QUERY, {
    locationId: update.locationId,
    inventoryItemId: update.inventoryItemId,
  });
  const location = data.location;
  const node = location?.inventoryLevel;
  if (!location || !node) return "ignored";
  const level = toInventoryLevel(node, location);
  if (!level || !level.tracked) return "ignored";

  // Read first for the sales demand from the last sync, and to skip obviously old updates early.
  const known = await deps.getLevelState(shop, level.id);
  if (known?.shopifyUpdatedAt && update.updatedAt && update.updatedAt <= known.shopifyUpdatedAt) {
    return "stale";
  }

  // Re-reading 30 days of orders on every stock change would be wasteful, so demand comes from the last sync.
  const settings = await deps.loadSettings(shop);
  const salesDemand = known?.demandSource === "sales" ? { [level.id]: known.averageDailyDemand } : null;
  const [item] = buildDashboardItems([level], settings.defaults, settings.overrides, {
    ...settings.options,
    salesDemand,
  });

  // The transition is judged on the state this write replaced, not the earlier read, so two webhooks
  // processed at the same moment record it once.
  const swap = await deps.swapLevelState(shop, item, update.updatedAt);
  if (!swap.applied) return "stale";
  if (needsReorder(item) && !swap.previous?.needsReorder) {
    const now = deps.now?.() ?? new Date();
    await deps.recordHistory(shop, buildHistoryEntry([item], "stock_change", settings.options.incomingStock, now));
    return "now_needs_reorder";
  }
  return "updated";
}

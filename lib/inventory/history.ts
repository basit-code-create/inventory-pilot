import { needsReorder, summarizeInventory, type DashboardItem } from "./dashboard";
import type { IncomingStockMode } from "./reorder";
import type { DemandSource } from "./rules";

/** "sync": the merchant pressed Sync. "stock_change": a webhook moved an item to needing a reorder. */
export type HistoryTrigger = "sync" | "stock_change";

/** One recommendation as it stood at that moment, so later changes to stock or rules don't rewrite it. */
export interface HistoryItem {
  levelId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  locationName: string;
  available: number;
  incoming: number;
  reorderPoint: number;
  averageDailyDemand: number;
  demandSource: DemandSource;
  recommendedQuantity: number;
}

export interface HistoryEntry {
  id: string | null;
  createdAt: string;
  trigger: HistoryTrigger;
  incomingStock: IncomingStockMode;
  summary: {
    stockLevels: number;
    lowStock: number;
    outOfStock: number;
    needsReorder: number;
    recommendedUnits: number;
  };
  items: HistoryItem[];
  /** More items needed a reorder than one entry keeps. */
  itemsTruncated: boolean;
}

/** Keeps each entry far below MongoDB's 16 MB document limit. */
export const MAX_HISTORY_ITEMS = 500;

export function toHistoryItem(item: DashboardItem): HistoryItem {
  return {
    levelId: item.level.id,
    productTitle: item.level.productTitle,
    variantTitle: item.level.variantTitle,
    sku: item.level.sku,
    locationName: item.level.locationName,
    available: item.level.available,
    incoming: item.level.incoming,
    reorderPoint: item.reorder?.reorderPoint ?? 0,
    averageDailyDemand: item.rule.averageDailyDemand,
    demandSource: item.demandSource,
    recommendedQuantity: item.reorder?.recommendedQuantity ?? 0,
  };
}

/** Records only the items that need a reorder; the summary covers every item. */
export function buildHistoryEntry(
  items: readonly DashboardItem[],
  trigger: HistoryTrigger,
  incomingStock: IncomingStockMode,
  now: Date,
): HistoryEntry {
  const summary = summarizeInventory(items);
  const reorderItems = items.filter(needsReorder);
  return {
    id: null,
    createdAt: now.toISOString(),
    trigger,
    incomingStock,
    summary: {
      stockLevels: summary.stockLevels,
      lowStock: summary.lowStock,
      outOfStock: summary.outOfStock,
      needsReorder: summary.needsReorder,
      recommendedUnits: summary.recommendedUnits,
    },
    items: reorderItems.slice(0, MAX_HISTORY_ITEMS).map(toHistoryItem),
    itemsTruncated: reorderItems.length > MAX_HISTORY_ITEMS,
  };
}

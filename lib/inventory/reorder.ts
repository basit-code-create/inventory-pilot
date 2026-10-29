import type { ReorderRule } from "./types";

export interface StockPosition {
  available: number;
  incoming: number;
}

export interface ReorderResult {
  /** At or below this many units (available + incoming), a reorder is recommended. */
  reorderPoint: number;
  reorderPointSource: "calculated" | "manual";
  /** available + incoming */
  inventoryPosition: number;
  shouldReorder: boolean;
  recommendedQuantity: number;
}

/**
 * averageDailyDemand * leadTimeDays + safetyStock, rounded up to whole units
 * because stock can't be held or ordered in fractions.
 */
export function calculateReorderPoint(
  rule: Pick<ReorderRule, "averageDailyDemand" | "leadTimeDays" | "safetyStock">,
): number {
  const units = rule.averageDailyDemand * rule.leadTimeDays + rule.safetyStock;
  // Drop floating-point noise (0.7 * 10 === 7.000000000000001) before rounding up.
  return Math.ceil(Number(units.toFixed(6)));
}

export function resolveReorderPoint(rule: ReorderRule): number {
  return rule.reorderPointOverride ?? calculateReorderPoint(rule);
}

/**
 * "include" counts incoming stock (transfers, purchase orders) as if it were already on hand.
 * "exclude" plans from available stock alone, for merchants whose incoming dates are unreliable.
 */
export type IncomingStockMode = "include" | "exclude";

export interface ReorderOptions {
  incomingStock: IncomingStockMode;
}

export const DEFAULT_REORDER_OPTIONS: ReorderOptions = { incomingStock: "include" };

/** Available may be negative (oversold); incoming can't be. Both are whole units. */
export function validateStock(stock: StockPosition): string | null {
  if (!Number.isInteger(stock.available)) return "Available stock isn't a whole number.";
  if (!Number.isInteger(stock.incoming) || stock.incoming < 0) {
    return "Incoming stock isn't a whole number of 0 or more.";
  }
  return null;
}

/**
 * Recommendation only: this never changes inventory or creates orders.
 *
 *   inventoryPosition   = available + incoming   (just available when incoming is excluded)
 *   shouldReorder       = inventoryPosition <= reorderPoint
 *   recommendedQuantity = shouldReorder ? max(0, targetStock - inventoryPosition) : 0
 */
export function calculateReorder(
  stock: StockPosition,
  rule: ReorderRule,
  options: ReorderOptions = DEFAULT_REORDER_OPTIONS,
): ReorderResult {
  const reorderPoint = resolveReorderPoint(rule);
  const inventoryPosition = stock.available + (options.incomingStock === "include" ? stock.incoming : 0);
  const shouldReorder = inventoryPosition <= reorderPoint;

  return {
    reorderPoint,
    reorderPointSource: rule.reorderPointOverride === null ? "calculated" : "manual",
    inventoryPosition,
    shouldReorder,
    recommendedQuantity: shouldReorder ? Math.max(0, rule.targetStock - inventoryPosition) : 0,
  };
}

/** Checks reorder options that arrived from outside (an API request). */
export function parseReorderOptions(input: unknown): ReorderOptions | null {
  if (!input || typeof input !== "object") return null;
  const { incomingStock } = input as Record<string, unknown>;
  return incomingStock === "include" || incomingStock === "exclude" ? { incomingStock } : null;
}

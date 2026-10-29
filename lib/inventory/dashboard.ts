import {
  calculateReorder,
  DEFAULT_REORDER_OPTIONS,
  validateStock,
  type ReorderOptions,
  type ReorderResult,
} from "./reorder";
import {
  demandSourceFor,
  hasRuleErrors,
  resolveRule,
  validateRule,
  type DemandSource,
  type RuleErrors,
} from "./rules";
import type { InventoryLevel, Money, ReorderRule, RuleOverrides } from "./types";

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";
export type StatusFilter = "all" | "needs_reorder" | StockStatus;

export const STATUS_FILTERS: readonly StatusFilter[] = [
  "all",
  "needs_reorder",
  "low_stock",
  "out_of_stock",
  "in_stock",
];

export interface DashboardItem {
  level: InventoryLevel;
  rule: ReorderRule;
  hasCustomRule: boolean;
  ruleErrors: RuleErrors;
  demandSource: DemandSource;
  /** Set when the stock numbers themselves are unusable. */
  stockError: string | null;
  /** Null when the rule or the stock is invalid: no recommendation is made from bad input. */
  reorder: ReorderResult | null;
  status: StockStatus;
  /** Days until available stock runs out at the current demand; 0 when already out, null when it isn't selling. */
  daysOfCover: number | null;
}

export interface BuildOptions extends ReorderOptions {
  /** Sales-based average daily demand per level ID, when sales history is available. */
  salesDemand?: Record<string, number> | null;
}

export interface InventoryFilters {
  query: string;
  status: StatusFilter;
  /** null means every location. */
  locationId: string | null;
}

export const DEFAULT_FILTERS: InventoryFilters = { query: "", status: "all", locationId: null };

export interface InventorySummary {
  trackedVariants: number;
  stockLevels: number;
  locations: number;
  lowStock: number;
  outOfStock: number;
  needsReorder: number;
  recommendedUnits: number;
  /** Cost of the recommended orders, for items with a cost per item. Null if none have one. */
  recommendedValue: Money | null;
  /** Items needing a reorder whose cost per item isn't set, so they're missing from the value. */
  reorderItemsWithoutCost: number;
  customRules: number;
  invalidRules: number;
}

/** Status reflects what is on hand now; incoming stock only affects the reorder decision. */
export function getStockStatus(available: number, reorderPoint: number | null): StockStatus {
  if (available <= 0) return "out_of_stock";
  if (reorderPoint !== null && available <= reorderPoint) return "low_stock";
  return "in_stock";
}

/** Available ÷ average daily demand. On-hand only: incoming stock has no arrival date to count from. */
export function daysOfCoverFor(available: number, averageDailyDemand: number): number | null {
  if (available <= 0) return 0;
  return Number.isFinite(averageDailyDemand) && averageDailyDemand > 0 ? available / averageDailyDemand : null;
}

const STATUS_ORDER: Record<StockStatus, number> = { out_of_stock: 0, low_stock: 1, in_stock: 2 };

function compareUrgency(a: DashboardItem, b: DashboardItem): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    Number(needsReorder(b)) - Number(needsReorder(a)) ||
    // Sooner to run out comes first; items that aren't selling come last.
    (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) ||
    a.level.productTitle.localeCompare(b.level.productTitle) ||
    a.level.variantTitle.localeCompare(b.level.variantTitle) ||
    a.level.locationName.localeCompare(b.level.locationName)
  );
}

export function buildDashboardItems(
  levels: readonly InventoryLevel[],
  defaults: ReorderRule,
  overrides: RuleOverrides,
  options: BuildOptions = DEFAULT_REORDER_OPTIONS,
): DashboardItem[] {
  return levels
    .filter((level) => level.tracked)
    .map((level) => {
      const override = overrides[level.id];
      const salesDemand = options.salesDemand?.[level.id] ?? null;
      const rule = resolveRule(defaults, override, salesDemand);
      const ruleErrors = validateRule(rule);
      const stockError = validateStock(level);
      const reorder = hasRuleErrors(ruleErrors) || stockError ? null : calculateReorder(level, rule, options);

      return {
        level,
        rule,
        hasCustomRule: override !== undefined && Object.keys(override).length > 0,
        ruleErrors,
        demandSource: demandSourceFor(override, salesDemand),
        stockError,
        reorder,
        daysOfCover: stockError ? null : daysOfCoverFor(level.available, rule.averageDailyDemand),
        status: getStockStatus(level.available, reorder?.reorderPoint ?? null),
      };
    })
    .sort(compareUrgency);
}

export function needsReorder(item: DashboardItem): boolean {
  return item.reorder?.shouldReorder === true;
}

/** On-hand stock is at or below the reorder point, but incoming stock lifts the position above it. */
export function isCoveredByIncoming(item: DashboardItem): boolean {
  return (
    item.reorder !== null &&
    !item.reorder.shouldReorder &&
    item.level.available <= item.reorder.reorderPoint
  );
}

/** Recommended quantity × cost per item, when the item needs a reorder and has a cost. */
export function orderValue(item: DashboardItem): Money | null {
  const cost = item.level.unitCost;
  if (!cost || !item.reorder?.shouldReorder) return null;
  return { amount: item.reorder.recommendedQuantity * cost.amount, currencyCode: cost.currencyCode };
}

/** Costs all come from one shop and share its currency; anything in another currency is left out. */
export function addMoney(total: Money | null, value: Money): Money {
  if (!total) return { ...value };
  return value.currencyCode === total.currencyCode ? { ...total, amount: total.amount + value.amount } : total;
}

export function summarizeInventory(items: readonly DashboardItem[]): InventorySummary {
  const variants = new Set<string>();
  const locations = new Set<string>();
  const summary: InventorySummary = {
    trackedVariants: 0,
    stockLevels: items.length,
    locations: 0,
    lowStock: 0,
    outOfStock: 0,
    needsReorder: 0,
    recommendedUnits: 0,
    recommendedValue: null,
    reorderItemsWithoutCost: 0,
    customRules: 0,
    invalidRules: 0,
  };

  for (const item of items) {
    variants.add(item.level.variantId);
    locations.add(item.level.locationId);
    if (item.status === "low_stock") summary.lowStock += 1;
    if (item.status === "out_of_stock") summary.outOfStock += 1;
    if (item.hasCustomRule) summary.customRules += 1;
    if (item.reorder === null) summary.invalidRules += 1;
    if (needsReorder(item)) {
      summary.needsReorder += 1;
      summary.recommendedUnits += item.reorder?.recommendedQuantity ?? 0;
      const value = orderValue(item);
      if (value) summary.recommendedValue = addMoney(summary.recommendedValue, value);
      else summary.reorderItemsWithoutCost += 1;
    }
  }

  summary.trackedVariants = variants.size;
  summary.locations = locations.size;
  return summary;
}

export function matchesStatus(item: DashboardItem, status: StatusFilter): boolean {
  switch (status) {
    case "all":
      return true;
    case "needs_reorder":
      return needsReorder(item);
    default:
      return item.status === status;
  }
}

/** Every whitespace-separated term must appear in the product, variant, SKU or location. */
function matchesQuery(item: DashboardItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const { productTitle, variantTitle, sku, locationName } = item.level;
  const haystack = [productTitle, variantTitle, sku ?? "", locationName].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function filterItems(
  items: readonly DashboardItem[],
  filters: InventoryFilters,
): DashboardItem[] {
  return items.filter(
    (item) =>
      (filters.locationId === null || item.level.locationId === filters.locationId) &&
      matchesStatus(item, filters.status) &&
      matchesQuery(item, filters.query),
  );
}

export function countByStatus(items: readonly DashboardItem[]): Record<StatusFilter, number> {
  const counts = {} as Record<StatusFilter, number>;
  for (const status of STATUS_FILTERS) {
    counts[status] = items.filter((item) => matchesStatus(item, status)).length;
  }
  return counts;
}

export function listLocations(items: readonly DashboardItem[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const { level } of items) byId.set(level.locationId, level.locationName);
  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

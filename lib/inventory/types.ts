/**
 * Where the numbers on screen came from. Only "live" may ever be presented as
 * Shopify data; "demo" is sample data and must always be labelled as such.
 */
export type DataSource = "demo" | "live";

/** One inventory item (a product variant) stocked at one location. */
export interface InventoryLevel {
  /** Stable key for this variant at this location: `${variantId}@${locationId}`. */
  id: string;
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  /** Whether inventory is tracked for this item. Untracked items are left out of the dashboard. */
  tracked: boolean;
  locationId: string;
  locationName: string;
  /** Units available to sell. Negative when the variant is oversold. */
  available: number;
  /** Units on the way to this location, such as transfers or purchase orders. */
  incoming: number;
}

export interface InventorySnapshot {
  source: DataSource;
  levels: InventoryLevel[];
  /** ISO timestamp of when this snapshot was produced. */
  loadedAt: string;
  /** Live only: how many Shopify locations were read. */
  locationCount?: number;
  /** Live only: the store had more stock levels than one sync loads, so some are missing. */
  truncated?: boolean;
}

export interface ReorderRule {
  /** Expected units sold per day. Decimals allowed. */
  averageDailyDemand: number;
  /** Days between placing an order and the stock arriving. */
  leadTimeDays: number;
  /** Buffer units kept on top of lead-time demand. */
  safetyStock: number;
  /** Stock level a reorder should bring the item back up to. */
  targetStock: number;
  /** When set, used instead of the calculated reorder point. */
  reorderPointOverride: number | null;
}

/** Units of one variant sold over a period, split by the location each order was fulfilled from. */
export interface VariantSales {
  byLocation: Record<string, number>;
  /** Units from orders that aren't fulfilled yet and have no retail location. */
  unassigned: number;
}

export interface SalesHistory {
  windowDays: number;
  /** ISO timestamp of the start of the window. */
  since: string;
  ordersCounted: number;
  /** Some orders or line items in the window weren't read, so demand may be understated. */
  truncated: boolean;
  /** Keyed by variant ID. Variants with no sales in the window are absent. */
  variants: Record<string, VariantSales>;
}

/** Per variant-location override. Fields left unset fall back to the default rule. */
export type ReorderRuleOverride = Partial<ReorderRule>;

/** Overrides keyed by InventoryLevel.id. */
export type RuleOverrides = Record<string, ReorderRuleOverride>;

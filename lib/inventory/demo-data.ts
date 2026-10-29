import type {
  InventoryLevel,
  InventorySnapshot,
  ReorderRuleOverride,
  RuleOverrides,
} from "./types";

/*
 * Phase 1 sample data. Nothing in this file comes from Shopify: IDs use a "demo-"
 * prefix instead of Shopify GIDs, and every snapshot is tagged source: "demo" so
 * the dashboard always labels it as sample data.
 */

interface DemoLocation {
  locationId: string;
  locationName: string;
}

interface DemoVariant {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  tracked: boolean;
}

interface DemoStock {
  variant: DemoVariant;
  location: DemoLocation;
  available: number;
  incoming: number;
  rule?: ReorderRuleOverride;
}

const WAREHOUSE: DemoLocation = { locationId: "demo-location-1", locationName: "Main Warehouse" };
const DOWNTOWN: DemoLocation = { locationId: "demo-location-2", locationName: "Downtown Store" };

function product(productNumber: number, productTitle: string) {
  return (variantNumber: number, variantTitle: string, sku: string | null, tracked = true): DemoVariant => ({
    productId: `demo-product-${productNumber}`,
    productTitle,
    variantId: `demo-variant-${variantNumber}`,
    variantTitle,
    sku,
    inventoryItemId: `demo-inventory-item-${variantNumber}`,
    tracked,
  });
}

const tee = product(1, "Classic Crew Tee");
const hoodie = product(2, "Everyday Hoodie");
const pourOver = product(3, "Ceramic Pour-Over Set");
const bottle = product(4, "Insulated Bottle");
const tote = product(5, "Canvas Tote");
const beanie = product(6, "Merino Beanie");
const coffee = product(7, "Single-Origin Coffee Beans 1 kg");
const giftCard = product(8, "Gift Card");
const stickers = product(9, "Sticker Pack");

const TEE_BLACK_S = tee(101, "Small / Black", "TEE-BLK-S");
const TEE_BLACK_M = tee(102, "Medium / Black", "TEE-BLK-M");
const TEE_BLACK_L = tee(103, "Large / Black", "TEE-BLK-L");
const TEE_WHITE_M = tee(104, "Medium / White", "TEE-WHT-M");
const HOODIE_S = hoodie(201, "Small / Heather Grey", "HOOD-GRY-S");
const HOODIE_M = hoodie(202, "Medium / Heather Grey", "HOOD-GRY-M");
const HOODIE_L = hoodie(203, "Large / Heather Grey", "HOOD-GRY-L");
const POUR_OVER = pourOver(301, "Default Title", "POUR-SET-01");
const BOTTLE_500 = bottle(401, "500 ml / Sage", "BTL-500-SAG");
const BOTTLE_750 = bottle(402, "750 ml / Charcoal", "BTL-750-CHR");
const TOTE = tote(501, "Default Title", "TOTE-NAT");
const BEANIE_CHARCOAL = beanie(601, "Charcoal", "BEANIE-CHR");
const BEANIE_RUST = beanie(602, "Rust", "BEANIE-RST");
const COFFEE_MEDIUM = coffee(701, "Medium Roast", "COF-MED-1KG");
const COFFEE_DARK = coffee(702, "Dark Roast", "COF-DRK-1KG");
const GIFT_CARD = giftCard(801, "$25", null, false);
const STICKERS = stickers(901, "Default Title", null);

const STOCK: DemoStock[] = [
  { variant: TEE_BLACK_S, location: WAREHOUSE, available: 42, incoming: 0, rule: { averageDailyDemand: 2.5 } },
  { variant: TEE_BLACK_M, location: WAREHOUSE, available: 18, incoming: 0, rule: { averageDailyDemand: 4, targetStock: 90 } },
  { variant: TEE_BLACK_L, location: WAREHOUSE, available: 0, incoming: 0, rule: { averageDailyDemand: 3, targetStock: 80 } },
  // Low on hand, but incoming stock covers the reorder point.
  { variant: TEE_WHITE_M, location: WAREHOUSE, available: 25, incoming: 40, rule: { averageDailyDemand: 3, targetStock: 80 } },
  { variant: TEE_BLACK_S, location: DOWNTOWN, available: 9, incoming: 0, rule: { averageDailyDemand: 0.8, safetyStock: 5, targetStock: 30 } },
  // Exactly at the reorder point (14), which triggers a reorder.
  { variant: TEE_BLACK_M, location: DOWNTOWN, available: 14, incoming: 0, rule: { averageDailyDemand: 1.2, safetyStock: 5, targetStock: 30 } },
  { variant: HOODIE_S, location: WAREHOUSE, available: 31, incoming: 0, rule: { averageDailyDemand: 1.5 } },
  // Oversold: available is negative.
  { variant: HOODIE_M, location: WAREHOUSE, available: -2, incoming: 0, rule: { averageDailyDemand: 2, targetStock: 70 } },
  // Incoming stock reduces the recommended quantity but doesn't cover the reorder point.
  { variant: HOODIE_L, location: WAREHOUSE, available: 12, incoming: 6, rule: { averageDailyDemand: 1.8 } },
  { variant: POUR_OVER, location: WAREHOUSE, available: 64, incoming: 0, rule: { averageDailyDemand: 0.6, leadTimeDays: 21, safetyStock: 8 } },
  { variant: POUR_OVER, location: DOWNTOWN, available: 6, incoming: 0, rule: { averageDailyDemand: 0.3, leadTimeDays: 21, safetyStock: 3, targetStock: 15 } },
  { variant: BOTTLE_500, location: WAREHOUSE, available: 120, incoming: 0, rule: { averageDailyDemand: 3.5, targetStock: 150 } },
  // Out of stock now, with a delivery already on the way.
  { variant: BOTTLE_750, location: WAREHOUSE, available: 0, incoming: 48, rule: { averageDailyDemand: 2.2, targetStock: 100 } },
  { variant: BOTTLE_500, location: DOWNTOWN, available: 22, incoming: 0, rule: { safetyStock: 6, targetStock: 40 } },
  { variant: TOTE, location: WAREHOUSE, available: 85, incoming: 0 },
  { variant: TOTE, location: DOWNTOWN, available: 16, incoming: 0 },
  { variant: BEANIE_CHARCOAL, location: WAREHOUSE, available: 38, incoming: 0 },
  { variant: BEANIE_RUST, location: WAREHOUSE, available: 0, incoming: 0, rule: { averageDailyDemand: 0.5, targetStock: 40 } },
  { variant: COFFEE_MEDIUM, location: WAREHOUSE, available: 54, incoming: 0, rule: { averageDailyDemand: 6, leadTimeDays: 5, safetyStock: 15, targetStock: 120 } },
  { variant: COFFEE_DARK, location: WAREHOUSE, available: 33, incoming: 0, rule: { averageDailyDemand: 5, leadTimeDays: 5, safetyStock: 15, targetStock: 120 } },
  // Gift cards don't track inventory, so the dashboard leaves this out.
  { variant: GIFT_CARD, location: WAREHOUSE, available: 0, incoming: 0 },
  { variant: STICKERS, location: DOWNTOWN, available: 140, incoming: 0 },
];

function levelId({ variant, location }: DemoStock): string {
  return `${variant.variantId}@${location.locationId}`;
}

export const DEMO_LEVELS: readonly InventoryLevel[] = STOCK.map((stock) => ({
  id: levelId(stock),
  ...stock.variant,
  ...stock.location,
  available: stock.available,
  incoming: stock.incoming,
}));

/** Sample per variant-location rules; in a later phase these come from the database. */
export const DEMO_RULE_OVERRIDES: RuleOverrides = Object.fromEntries(
  STOCK.flatMap((stock) => (stock.rule ? [[levelId(stock), stock.rule]] : [])),
);

export type DemoScenario = "normal" | "loading" | "empty" | "error";

export const DEMO_SCENARIOS: readonly { value: DemoScenario; label: string }[] = [
  { value: "normal", label: "Sample inventory" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "Empty store" },
  { value: "error", label: "Load error" },
];

const DEMO_LATENCY_MS = 500;

/** Simulates a network load so the dashboard's loading, empty and error states can be tested. */
export function loadDemoInventory(scenario: DemoScenario = "normal"): Promise<InventorySnapshot> {
  // Stays pending so the loading skeleton can be inspected.
  if (scenario === "loading") return new Promise(() => {});

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (scenario === "error") {
        reject(
          new Error(
            "Simulated error: the demo inventory failed to load. Switch “Preview state” to “Sample inventory” to continue.",
          ),
        );
        return;
      }
      resolve({
        source: "demo",
        levels: scenario === "empty" ? [] : DEMO_LEVELS.map((level) => ({ ...level })),
        loadedAt: new Date().toISOString(),
      });
    }, DEMO_LATENCY_MS);
  });
}

import { describe, expect, it } from "vitest";
import {
  buildDashboardItems,
  countByStatus,
  DEFAULT_FILTERS,
  filterItems,
  getStockStatus,
  isCoveredByIncoming,
  listLocations,
  summarizeInventory,
} from "./dashboard";
import { DEMO_LEVELS, DEMO_RULE_OVERRIDES } from "./demo-data";
import { DEFAULT_REORDER_RULE } from "./rules";

const items = buildDashboardItems(DEMO_LEVELS, DEFAULT_REORDER_RULE, DEMO_RULE_OVERRIDES);
const findItem = (id: string) => items.find((item) => item.level.id === id);

describe("getStockStatus", () => {
  it("classifies by what is available now", () => {
    expect(getStockStatus(-2, 20)).toBe("out_of_stock");
    expect(getStockStatus(0, 20)).toBe("out_of_stock");
    expect(getStockStatus(20, 20)).toBe("low_stock");
    expect(getStockStatus(21, 20)).toBe("in_stock");
  });
});

describe("buildDashboardItems", () => {
  it("leaves out untracked inventory", () => {
    expect(items).toHaveLength(DEMO_LEVELS.length - 1);
    expect(items.some((item) => item.level.productTitle === "Gift Card")).toBe(false);
  });

  it("lists the most urgent items first", () => {
    const statuses = items.map((item) => item.status);
    expect(statuses.indexOf("in_stock")).toBeGreaterThan(statuses.lastIndexOf("low_stock"));
    expect(statuses.indexOf("low_stock")).toBeGreaterThan(statuses.lastIndexOf("out_of_stock"));
  });

  it("flags low stock that incoming inventory already covers", () => {
    const item = findItem("demo-variant-104@demo-location-1");
    expect(item?.status).toBe("low_stock");
    expect(item && isCoveredByIncoming(item)).toBe(true);
  });

  it("withholds a recommendation when the rule is invalid", () => {
    const [item] = buildDashboardItems([DEMO_LEVELS[0]], DEFAULT_REORDER_RULE, {
      [DEMO_LEVELS[0].id]: { targetStock: 5 },
    });
    expect(item.reorder).toBeNull();
    expect(item.ruleErrors).toHaveProperty("targetStock");
  });
});

describe("summarizeInventory", () => {
  it("matches the demo data set", () => {
    expect(summarizeInventory(items)).toEqual({
      trackedVariants: 16,
      stockLevels: 21,
      locations: 2,
      lowStock: 8,
      outOfStock: 4,
      needsReorder: 10,
      recommendedUnits: 483,
      customRules: 17,
      invalidRules: 0,
    });
  });
});

describe("filterItems", () => {
  it("matches every search term across product, variant, SKU and location", () => {
    const results = filterItems(items, { ...DEFAULT_FILTERS, query: "tee black downtown" });
    expect(results.map((item) => item.level.sku)).toEqual(["TEE-BLK-M", "TEE-BLK-S"]);
  });

  it("searches SKUs case-insensitively", () => {
    expect(filterItems(items, { ...DEFAULT_FILTERS, query: "cof-drk" })).toHaveLength(1);
  });

  it("filters by status and location together", () => {
    const results = filterItems(items, {
      ...DEFAULT_FILTERS,
      status: "out_of_stock",
      locationId: "demo-location-1",
    });
    expect(results).toHaveLength(4);
    expect(results.every((item) => item.level.available <= 0)).toBe(true);
  });

  it("counts each status tab", () => {
    expect(countByStatus(items)).toEqual({
      all: 21,
      needs_reorder: 10,
      low_stock: 8,
      out_of_stock: 4,
      in_stock: 9,
    });
  });
});

describe("listLocations", () => {
  it("returns each location once, sorted by name", () => {
    expect(listLocations(items)).toEqual([
      { id: "demo-location-2", name: "Downtown Store" },
      { id: "demo-location-1", name: "Main Warehouse" },
    ]);
  });
});

describe("demand and incoming settings", () => {
  const [level] = DEMO_LEVELS; // 42 available at the warehouse, override demand 2.5/day
  const plain = { ...level, id: "plain", available: 20, incoming: 30 };

  it("prefers a manual demand, then sales demand, then the default rule", () => {
    const manual = buildDashboardItems([level], DEFAULT_REORDER_RULE, DEMO_RULE_OVERRIDES, {
      incomingStock: "include",
      salesDemand: { [level.id]: 9 },
    })[0];
    expect(manual).toMatchObject({ demandSource: "manual", rule: { averageDailyDemand: 2.5 } });

    const fromSales = buildDashboardItems([plain], DEFAULT_REORDER_RULE, {}, {
      incomingStock: "include",
      salesDemand: { plain: 4 },
    })[0];
    expect(fromSales).toMatchObject({ demandSource: "sales", rule: { averageDailyDemand: 4 } });

    const fallback = buildDashboardItems([plain], DEFAULT_REORDER_RULE, {})[0];
    expect(fallback).toMatchObject({ demandSource: "default", rule: { averageDailyDemand: 1 } });
  });

  it("changes the recommendation when incoming stock is ignored", () => {
    // The default reorder point is 17: 10 available + 30 incoming covers it, 10 alone doesn't.
    const low = { ...plain, available: 10 };
    const counted = buildDashboardItems([low], DEFAULT_REORDER_RULE, {}, { incomingStock: "include" })[0];
    const ignored = buildDashboardItems([low], DEFAULT_REORDER_RULE, {}, { incomingStock: "exclude" })[0];
    expect(counted.reorder?.shouldReorder).toBe(false);
    expect(ignored.reorder).toMatchObject({ shouldReorder: true, recommendedQuantity: 50 });
  });

  it("withholds a recommendation for unusable stock numbers", () => {
    const [item] = buildDashboardItems([{ ...plain, available: 2.5 }], DEFAULT_REORDER_RULE, {});
    expect(item.reorder).toBeNull();
    expect(item.stockError).not.toBeNull();
  });
});

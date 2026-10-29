import { describe, expect, it } from "vitest";
import {
  buildDashboardItems,
  countByStatus,
  daysOfCoverFor,
  DEFAULT_FILTERS,
  filterItems,
  getStockStatus,
  isCoveredByIncoming,
  listLocations,
  summarizeInventory,
} from "./dashboard";
import { DEMO_LEVELS, DEMO_RULE_OVERRIDES } from "./demo-data";
import { DEFAULT_REORDER_OPTIONS } from "./reorder";
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
      recommendedValue: { amount: 4399.5, currencyCode: "USD" },
      reorderItemsWithoutCost: 0,
      customRules: 17,
      invalidRules: 0,
    });
  });
});

describe("filterItems", () => {
  it("matches every search term across product, variant, SKU and location", () => {
    const results = filterItems(items, { ...DEFAULT_FILTERS, query: "tee black downtown" });
    // Both need a reorder; Small runs out first (9 ÷ 0.8 = 11.3 days vs 14 ÷ 1.2 = 11.7 days).
    expect(results.map((item) => item.level.sku)).toEqual(["TEE-BLK-S", "TEE-BLK-M"]);
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
      ...DEFAULT_REORDER_OPTIONS,
      incomingStock: "include",
      salesDemand: { [level.id]: 9 },
    })[0];
    expect(manual).toMatchObject({ demandSource: "manual", rule: { averageDailyDemand: 2.5 } });

    const fromSales = buildDashboardItems([plain], DEFAULT_REORDER_RULE, {}, {
      ...DEFAULT_REORDER_OPTIONS,
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
    const counted = buildDashboardItems([low], DEFAULT_REORDER_RULE, {}, { ...DEFAULT_REORDER_OPTIONS, incomingStock: "include" })[0];
    const ignored = buildDashboardItems([low], DEFAULT_REORDER_RULE, {}, { ...DEFAULT_REORDER_OPTIONS, incomingStock: "exclude" })[0];
    expect(counted.reorder?.shouldReorder).toBe(false);
    expect(ignored.reorder).toMatchObject({ shouldReorder: true, recommendedQuantity: 50 });
  });

  it("withholds a recommendation for unusable stock numbers", () => {
    const [item] = buildDashboardItems([{ ...plain, available: 2.5 }], DEFAULT_REORDER_RULE, {});
    expect(item.reorder).toBeNull();
    expect(item.stockError).not.toBeNull();
  });
});

describe("daysOfCoverFor", () => {
  it("is available stock divided by daily demand", () => {
    expect(daysOfCoverFor(30, 2.5)).toBe(12);
  });

  it("is 0 when already out and null when nothing sells", () => {
    expect(daysOfCoverFor(0, 3)).toBe(0);
    expect(daysOfCoverFor(-2, 3)).toBe(0);
    expect(daysOfCoverFor(40, 0)).toBeNull();
  });
});

describe("run-out wording", () => {
  it("is compact in tables and dated in full", async () => {
    const { formatDaysLeft, formatRunsOut } = await import("./format");
    expect(formatDaysLeft(12.7)).toBe("12 days left");
    expect(formatDaysLeft(0.4)).toBe("Runs out today");
    expect(formatDaysLeft(0)).toBe("Out now");
    expect(formatRunsOut(1, new Date("2026-10-29T12:00:00Z"))).toMatch(/^Runs out in 1 day \(/);
  });
});

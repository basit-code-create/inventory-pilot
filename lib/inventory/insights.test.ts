import { describe, expect, it } from "vitest";
import { buildDashboardItems } from "./dashboard";
import { DEMO_LEVELS, DEMO_RULE_OVERRIDES } from "./demo-data";
import { csvCell, idleStock, NO_VENDOR, purchaseListByVendor, purchaseListCsv } from "./insights";
import { DEFAULT_REORDER_RULE } from "./rules";

const items = buildDashboardItems(DEMO_LEVELS, DEFAULT_REORDER_RULE, DEMO_RULE_OVERRIDES);

describe("purchaseListByVendor", () => {
  it("groups items to reorder by vendor with units and value", () => {
    const groups = purchaseListByVendor(items);
    expect(groups.map((group) => [group.vendor, group.items.length, group.units, group.value?.amount])).toEqual([
      ["Harbor Goods", 2, 53, 338],
      ["Highland Roasters", 1, 87, 957],
      ["Northwind Apparel", 7, 343, 3104.5],
    ]);
  });

  it("puts items without a vendor last and counts missing costs", () => {
    const [sticker] = DEMO_LEVELS.filter((level) => level.productTitle === "Sticker Pack");
    const lowSticker = { ...sticker, id: "sticker-low", available: 2 };
    const groups = purchaseListByVendor(buildDashboardItems([lowSticker, DEMO_LEVELS[2]], DEFAULT_REORDER_RULE, {}));
    expect(groups.map((group) => group.vendor)).toEqual(["Northwind Apparel", NO_VENDOR]);
    expect(groups[1]).toMatchObject({ value: null, itemsWithoutCost: 1 });
  });
});

describe("purchaseListCsv", () => {
  it("writes one row per item with a header", () => {
    const csv = purchaseListCsv(purchaseListByVendor(items));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "﻿Vendor,Product,Variant,SKU,Location,Available,Incoming,Order quantity,Cost per item,Order value,Currency",
    );
    expect(lines).toHaveLength(11);
    expect(lines).toContain("Highland Roasters,Single-Origin Coffee Beans 1 kg,Dark Roast,COF-DRK-1KG,Main Warehouse,33,0,87,11,957,USD");
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Tee, "Black"')).toBe('"Tee, ""Black"""');
    expect(csvCell("Line\nbreak")).toBe('"Line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(-2)).toBe("-2");
  });

  it("stops spreadsheet formulas from running", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("idleStock", () => {
  it("lists stocked items with no sales, most valuable first", () => {
    const salesDemand = Object.fromEntries(items.map((item) => [item.level.id, 1]));
    const bottle = items.find((item) => item.level.sku === "BTL-500-SAG" && item.level.locationName === "Main Warehouse");
    const tote = items.find((item) => item.level.sku === "TOTE-NAT" && item.level.locationName === "Main Warehouse");
    salesDemand[bottle!.level.id] = 0;
    salesDemand[tote!.level.id] = 0;

    const idle = idleStock(items, salesDemand);
    // Bottle: 120 × $9 = $1,080; tote: 85 × $4 = $340.
    expect(idle.items.map((item) => item.level.sku)).toEqual(["BTL-500-SAG", "TOTE-NAT"]);
    expect(idle).toMatchObject({ units: 205, value: { amount: 1420, currencyCode: "USD" } });
  });

  it("is empty without sales data", () => {
    expect(idleStock(items, null).items).toEqual([]);
  });
});

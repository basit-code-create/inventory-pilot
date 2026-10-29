import { describe, expect, it } from "vitest";
import { calculateReorder, calculateReorderPoint, validateStock } from "./reorder";
import type { ReorderRule } from "./types";

const rule: ReorderRule = {
  averageDailyDemand: 4,
  leadTimeDays: 7,
  safetyStock: 10,
  targetStock: 90,
  reorderPointOverride: null,
};

describe("calculateReorderPoint", () => {
  it("is demand over the lead time plus safety stock", () => {
    expect(calculateReorderPoint(rule)).toBe(38);
  });

  it("rounds fractional demand up to whole units", () => {
    expect(calculateReorderPoint({ averageDailyDemand: 2.5, leadTimeDays: 7, safetyStock: 10 })).toBe(28);
  });

  it("ignores floating-point noise when rounding up", () => {
    // 0.7 * 10 is 7.000000000000001 in JavaScript.
    expect(calculateReorderPoint({ averageDailyDemand: 0.7, leadTimeDays: 10, safetyStock: 0 })).toBe(7);
  });
});

describe("calculateReorder", () => {
  it("does not reorder when stock is above the reorder point", () => {
    expect(calculateReorder({ available: 50, incoming: 0 }, rule)).toEqual({
      reorderPoint: 38,
      reorderPointSource: "calculated",
      inventoryPosition: 50,
      shouldReorder: false,
      recommendedQuantity: 0,
    });
  });

  it("reorders up to the target when stock is low", () => {
    const result = calculateReorder({ available: 18, incoming: 0 }, rule);
    expect(result.shouldReorder).toBe(true);
    expect(result.recommendedQuantity).toBe(72);
  });

  it("reorders when stock is exactly at the reorder point", () => {
    const result = calculateReorder({ available: 38, incoming: 0 }, rule);
    expect(result.shouldReorder).toBe(true);
    expect(result.recommendedQuantity).toBe(52);
  });

  it("reorders the full target at zero stock", () => {
    expect(calculateReorder({ available: 0, incoming: 0 }, rule).recommendedQuantity).toBe(90);
  });

  it("covers oversold units when available is negative", () => {
    expect(calculateReorder({ available: -2, incoming: 0 }, rule).recommendedQuantity).toBe(92);
  });

  it("counts incoming stock toward the inventory position", () => {
    const result = calculateReorder({ available: 12, incoming: 20 }, rule);
    expect(result.inventoryPosition).toBe(32);
    expect(result.recommendedQuantity).toBe(58);
  });

  it("skips the reorder when incoming stock lifts the position above the reorder point", () => {
    const result = calculateReorder({ available: 10, incoming: 40 }, rule);
    expect(result.shouldReorder).toBe(false);
    expect(result.recommendedQuantity).toBe(0);
  });

  it("uses a manual reorder point when one is set", () => {
    const result = calculateReorder({ available: 45, incoming: 0 }, { ...rule, reorderPointOverride: 50 });
    expect(result.reorderPoint).toBe(50);
    expect(result.reorderPointSource).toBe("manual");
    expect(result.recommendedQuantity).toBe(45);
  });
});

describe("incoming stock setting", () => {
  const stock = { available: 10, incoming: 40 };

  it("counts incoming stock by default", () => {
    expect(calculateReorder(stock, rule)).toMatchObject({ inventoryPosition: 50, shouldReorder: false });
  });

  it("can plan from available stock alone", () => {
    expect(calculateReorder(stock, rule, { incomingStock: "exclude" })).toMatchObject({
      inventoryPosition: 10,
      shouldReorder: true,
      recommendedQuantity: 80,
    });
  });
});

describe("validateStock", () => {
  it("accepts whole numbers, including oversold stock", () => {
    expect(validateStock({ available: 12, incoming: 0 })).toBeNull();
    expect(validateStock({ available: -3, incoming: 5 })).toBeNull();
  });

  it("rejects fractional, missing or negative incoming stock", () => {
    expect(validateStock({ available: 1.5, incoming: 0 })).not.toBeNull();
    expect(validateStock({ available: NaN, incoming: 0 })).not.toBeNull();
    expect(validateStock({ available: 4, incoming: -1 })).not.toBeNull();
  });
});

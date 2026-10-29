import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_LEVELS, loadDemoInventory } from "./demo-data";

describe("demo data", () => {
  it("never uses Shopify IDs", () => {
    for (const level of DEMO_LEVELS) {
      for (const id of [level.productId, level.variantId, level.inventoryItemId, level.locationId]) {
        expect(id).toMatch(/^demo-/);
      }
    }
  });

  it("has a unique ID for each variant at each location", () => {
    expect(new Set(DEMO_LEVELS.map((level) => level.id)).size).toBe(DEMO_LEVELS.length);
  });
});

describe("loadDemoInventory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tags every snapshot as demo data", async () => {
    const snapshot = loadDemoInventory("normal");
    await vi.runAllTimersAsync();
    await expect(snapshot).resolves.toMatchObject({ source: "demo", levels: DEMO_LEVELS });
  });

  it("returns copies so the sample data can't be changed by callers", async () => {
    const snapshot = loadDemoInventory("normal");
    await vi.runAllTimersAsync();
    (await snapshot).levels[0].available = 999;
    expect(DEMO_LEVELS[0].available).not.toBe(999);
  });

  it("returns no levels for the empty scenario", async () => {
    const snapshot = loadDemoInventory("empty");
    await vi.runAllTimersAsync();
    await expect(snapshot).resolves.toMatchObject({ source: "demo", levels: [] });
  });

  it("rejects for the error scenario", async () => {
    const snapshot = loadDemoInventory("error");
    const assertion = expect(snapshot).rejects.toThrow(/Simulated error/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

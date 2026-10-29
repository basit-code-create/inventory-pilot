import { describe, expect, it } from "vitest";
import { demandByLevel } from "./demand";
import type { InventoryLevel, SalesHistory } from "./types";

function level(variantId: string, locationId: string, tracked = true): InventoryLevel {
  return {
    id: `${variantId}@${locationId}`,
    productId: "p",
    productTitle: "Tee",
    variantId,
    variantTitle: "M",
    sku: null,
    inventoryItemId: `item-${variantId}`,
    tracked,
    locationId,
    locationName: locationId,
    available: 10,
    incoming: 0,
  };
}

function history(variants: SalesHistory["variants"]): SalesHistory {
  return { windowDays: 30, since: "2026-09-29T00:00:00.000Z", ordersCounted: 1, truncated: false, variants };
}

describe("demandByLevel", () => {
  it("divides units sold by the length of the window", () => {
    const demand = demandByLevel([level("v1", "a")], history({ v1: { byLocation: { a: 60 }, unassigned: 0 } }));
    expect(demand).toEqual({ "v1@a": 2 });
  });

  it("gives each location the units it fulfilled", () => {
    const demand = demandByLevel(
      [level("v1", "a"), level("v1", "b")],
      history({ v1: { byLocation: { a: 45, b: 15 }, unassigned: 0 } }),
    );
    expect(demand).toEqual({ "v1@a": 1.5, "v1@b": 0.5 });
  });

  it("shares unfulfilled units in proportion to where the variant ships from", () => {
    const demand = demandByLevel(
      [level("v1", "a"), level("v1", "b")],
      history({ v1: { byLocation: { a: 30, b: 0 }, unassigned: 30 } }),
    );
    expect(demand).toEqual({ "v1@a": 2, "v1@b": 0 });
  });

  it("splits units evenly when the variant was never fulfilled from a stocked location", () => {
    const demand = demandByLevel(
      [level("v1", "a"), level("v1", "b")],
      history({ v1: { byLocation: { closed: 30 }, unassigned: 30 } }),
    );
    expect(demand).toEqual({ "v1@a": 1, "v1@b": 1 });
  });

  it("gives tracked variants with no sales a demand of 0 and skips untracked ones", () => {
    expect(demandByLevel([level("v2", "a"), level("v3", "a", false)], history({}))).toEqual({ "v2@a": 0 });
  });
});

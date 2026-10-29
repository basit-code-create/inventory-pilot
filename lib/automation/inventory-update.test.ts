import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REORDER_OPTIONS } from "../inventory/reorder";
import { DEFAULT_REORDER_RULE } from "../inventory/rules";
import { TEST_SHOP } from "../../test/shopify-fixtures";
import { parseInventoryUpdate, processInventoryUpdate, type InventoryUpdateDeps, type LevelState } from "./inventory-update";

type Graphql = InventoryUpdateDeps["graphql"];

const LEVEL_ID = "gid://shopify/ProductVariant/11@gid://shopify/Location/2";

function shopifyLevel(available: number, { tracked = true } = {}) {
  return vi.fn(async () => ({
    data: {
      location: {
        id: "gid://shopify/Location/2",
        name: "Warehouse",
        inventoryLevel: {
          quantities: [
            { name: "available", quantity: available },
            { name: "incoming", quantity: 0 },
          ],
          item: {
            id: "gid://shopify/InventoryItem/1",
            sku: "TEE-M",
            tracked,
            variants: {
              nodes: [
                { id: "gid://shopify/ProductVariant/11", title: "M", product: { id: "gid://shopify/Product/5", title: "Tee", status: "ACTIVE" } },
              ],
            },
          },
        },
      },
    },
    cost: null,
    apiVersion: null,
  })) as unknown as Graphql;
}

function setup(graphql: Graphql, initial: LevelState | null = null) {
  let state = initial;
  const history: unknown[] = [];
  const deps: InventoryUpdateDeps = {
    graphql,
    loadSettings: async () => ({ defaults: DEFAULT_REORDER_RULE, options: DEFAULT_REORDER_OPTIONS, overrides: {} }),
    getLevelState: async () => state,
    // Mirrors the MongoDB version: compare-and-swap in one step, rejecting equal or older updates.
    swapLevelState: async (_shop, item, shopifyUpdatedAt) => {
      if (state?.shopifyUpdatedAt && shopifyUpdatedAt && shopifyUpdatedAt <= state.shopifyUpdatedAt) {
        return { applied: false };
      }
      const previous = state;
      state = {
        averageDailyDemand: item.rule.averageDailyDemand,
        demandSource: item.demandSource,
        needsReorder: item.reorder?.shouldReorder ?? false,
        shopifyUpdatedAt,
      };
      return { applied: true, previous };
    },
    recordHistory: async (_shop, entry) => history.push(entry),
    now: () => new Date("2026-10-29T12:00:00Z"),
  };
  return { deps, history, state: () => state };
}

const payload = (updatedAt = "2026-10-29T10:00:00Z") => ({
  inventory_item_id: 1,
  location_id: 2,
  available: 5,
  updated_at: updatedAt,
});

describe("parseInventoryUpdate", () => {
  it("turns REST IDs into GIDs", () => {
    expect(parseInventoryUpdate(payload())).toEqual({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/2",
      updatedAt: new Date("2026-10-29T10:00:00Z"),
    });
  });

  it("rejects payloads without valid IDs", () => {
    expect(parseInventoryUpdate({ inventory_item_id: "1; drop", location_id: 2 })).toBeNull();
    expect(parseInventoryUpdate(null)).toBeNull();
  });
});

describe("processInventoryUpdate", () => {
  it("records history once when stock drops to its reorder point", async () => {
    // Default rule: reorder point 17, so 5 available needs a reorder.
    const { deps, history } = setup(shopifyLevel(5), { averageDailyDemand: 1, demandSource: "default", needsReorder: false, shopifyUpdatedAt: null });

    expect(await processInventoryUpdate(TEST_SHOP, payload(), deps)).toBe("now_needs_reorder");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ trigger: "stock_change", items: [{ levelId: LEVEL_ID, recommendedQuantity: 55 }] });
  });

  it("is idempotent: the same update again changes nothing", async () => {
    const { deps, history } = setup(shopifyLevel(5));
    await processInventoryUpdate(TEST_SHOP, payload(), deps);
    expect(await processInventoryUpdate(TEST_SHOP, payload(), deps)).toBe("stale");
    expect(history).toHaveLength(1);
  });

  it("records history once when two webhooks for the item are processed at the same moment", async () => {
    const { deps, history } = setup(shopifyLevel(5));
    const outcomes = await Promise.all([
      processInventoryUpdate(TEST_SHOP, payload("2026-10-29T10:00:00Z"), deps),
      processInventoryUpdate(TEST_SHOP, payload("2026-10-29T10:00:01Z"), deps),
    ]);
    expect(outcomes.filter((outcome) => outcome === "now_needs_reorder")).toHaveLength(1);
    expect(history).toHaveLength(1);
  });

  it("ignores an older update that arrives late", async () => {
    const { deps, history } = setup(shopifyLevel(5));
    await processInventoryUpdate(TEST_SHOP, payload("2026-10-29T10:00:00Z"), deps);
    expect(await processInventoryUpdate(TEST_SHOP, payload("2026-10-29T09:00:00Z"), deps)).toBe("stale");
    expect(history).toHaveLength(1);
  });

  it("doesn't add history while an item already needs a reorder", async () => {
    const { deps, history } = setup(shopifyLevel(4), { averageDailyDemand: 1, demandSource: "default", needsReorder: true, shopifyUpdatedAt: null });
    expect(await processInventoryUpdate(TEST_SHOP, payload(), deps)).toBe("updated");
    expect(history).toHaveLength(0);
  });

  it("reads stock from Shopify instead of trusting the payload", async () => {
    // The payload claims 5 available, but Shopify says 40: no reorder.
    const { deps, history, state } = setup(shopifyLevel(40));
    expect(await processInventoryUpdate(TEST_SHOP, payload(), deps)).toBe("updated");
    expect(history).toHaveLength(0);
    expect(state()?.needsReorder).toBe(false);
  });

  it("keeps using the sales demand from the last sync", async () => {
    // 3/day from sales → reorder point 3 × 7 + 10 = 31, so 30 available needs a reorder.
    const { deps, state } = setup(shopifyLevel(30), { averageDailyDemand: 3, demandSource: "sales", needsReorder: false, shopifyUpdatedAt: null });
    expect(await processInventoryUpdate(TEST_SHOP, payload(), deps)).toBe("now_needs_reorder");
    expect(state()).toMatchObject({ averageDailyDemand: 3, demandSource: "sales" });
  });

  it("ignores untracked items and malformed payloads", async () => {
    expect(await processInventoryUpdate(TEST_SHOP, payload(), setup(shopifyLevel(0, { tracked: false })).deps)).toBe("ignored");
    expect(await processInventoryUpdate(TEST_SHOP, { nope: true }, setup(shopifyLevel(0)).deps)).toBe("ignored");
  });
});

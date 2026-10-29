import { describe, expect, it, vi } from "vitest";
import type { QueryCost } from "./admin-graphql";
import { fetchLiveInventory, toInventoryLevel, type LevelNode } from "./inventory";

type Graphql = Parameters<typeof fetchLiveInventory>[0];

const WAREHOUSE = { id: "gid://shopify/Location/1", name: "Warehouse" };
const STORE = { id: "gid://shopify/Location/2", name: "Store" };

function levelNode(
  variant: number,
  { available = 5, incoming = 0, tracked = true, status = "ACTIVE", sku = `SKU-${variant}` as string | null } = {},
): LevelNode {
  return {
    quantities: [
      { name: "available", quantity: available },
      { name: "incoming", quantity: incoming },
    ],
    item: {
      id: `gid://shopify/InventoryItem/${variant}`,
      sku,
      tracked,
      unitCost: { amount: "6.50", currencyCode: "USD" },
      variants: {
        nodes: [
          {
            id: `gid://shopify/ProductVariant/${variant}`,
            title: `Variant ${variant}`,
            product: { id: "gid://shopify/Product/9", title: "Tee", status, vendor: "Acme Supply" },
          },
        ],
      },
    },
  };
}

const roomyCost: QueryCost = {
  requestedQueryCost: 100,
  actualQueryCost: 20,
  throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1900, restoreRate: 100 },
};

/** Fakes Shopify: location pages, then pages of stock levels per location. Cursors are page numbers. */
function fakeShopify(
  locationPages: (typeof WAREHOUSE)[][],
  levelPages: Record<string, (LevelNode[] | null)[]>,
  cost: QueryCost = roomyCost,
) {
  const graphql = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    const page = variables?.after ? Number(variables.after) : 0;
    const pageInfo = (total: number) => ({ hasNextPage: page + 1 < total, endCursor: String(page + 1) });

    if (query.includes("InventoryLocations")) {
      return { data: { locations: { pageInfo: pageInfo(locationPages.length), nodes: locationPages[page] } }, cost, apiVersion: null };
    }
    const pages = levelPages[String(variables?.locationId)];
    const nodes = pages[page];
    return {
      data: { location: nodes ? { inventoryLevels: { pageInfo: pageInfo(pages.length), nodes } } : null },
      cost,
      apiVersion: null,
    };
  });
  return graphql as unknown as Graphql & typeof graphql;
}

const noSleep = vi.fn(async () => {});

describe("fetchLiveInventory", () => {
  it("reads every page of stock levels at every location", async () => {
    const graphql = fakeShopify([[WAREHOUSE, STORE]], {
      [WAREHOUSE.id]: [[levelNode(1, { available: 12, incoming: 30 })], [levelNode(2, { available: -1 })]],
      [STORE.id]: [[levelNode(1, { available: 4 })]],
    });

    const result = await fetchLiveInventory(graphql, { sleep: noSleep });

    expect(result).toMatchObject({ locationCount: 2, truncated: false, requestCount: 4 });
    expect(result.levels.map((level) => [level.variantId, level.locationName, level.available, level.incoming])).toEqual([
      ["gid://shopify/ProductVariant/1", "Warehouse", 12, 30],
      ["gid://shopify/ProductVariant/2", "Warehouse", -1, 0],
      ["gid://shopify/ProductVariant/1", "Store", 4, 0],
    ]);
    expect(result.levels[0]).toMatchObject({
      id: "gid://shopify/ProductVariant/1@gid://shopify/Location/1",
      productTitle: "Tee",
      variantTitle: "Variant 1",
      sku: "SKU-1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      tracked: true,
    });
  });

  it("follows pagination of locations", async () => {
    const graphql = fakeShopify([[WAREHOUSE], [STORE]], {
      [WAREHOUSE.id]: [[levelNode(1)]],
      [STORE.id]: [[levelNode(2)]],
    });
    expect((await fetchLiveInventory(graphql, { sleep: noSleep })).locationCount).toBe(2);
  });

  it("skips archived products and items without a variant, but keeps untracked items flagged", async () => {
    const orphan = { ...levelNode(3), item: { ...levelNode(3).item, variants: { nodes: [] } } };
    const graphql = fakeShopify([[WAREHOUSE]], {
      [WAREHOUSE.id]: [[levelNode(1, { status: "ARCHIVED" }), orphan, levelNode(4, { tracked: false, sku: "" })]],
    });

    const { levels } = await fetchLiveInventory(graphql, { sleep: noSleep });
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ variantId: "gid://shopify/ProductVariant/4", tracked: false, sku: null });
  });

  it("slows down when the query-cost bucket runs low", async () => {
    const sleep = vi.fn(async () => {});
    const lowBudget: QueryCost = {
      requestedQueryCost: 300,
      actualQueryCost: 60,
      throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 100, restoreRate: 100 },
    };
    const graphql = fakeShopify([[WAREHOUSE]], { [WAREHOUSE.id]: [[levelNode(1)], [levelNode(2)]] }, lowBudget);

    await fetchLiveInventory(graphql, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("stops at the sync limit and says the result is incomplete", async () => {
    const graphql = fakeShopify([[WAREHOUSE]], {
      [WAREHOUSE.id]: [[levelNode(1), levelNode(2)], [levelNode(3), levelNode(4)]],
    });
    const result = await fetchLiveInventory(graphql, { sleep: noSleep, maxLevels: 3 });
    expect(result.truncated).toBe(true);
    expect(result.levels).toHaveLength(3);
  });

  it("skips a location deleted during the sync", async () => {
    const graphql = fakeShopify([[WAREHOUSE, STORE]], {
      [WAREHOUSE.id]: [null],
      [STORE.id]: [[levelNode(1)]],
    });
    const { levels } = await fetchLiveInventory(graphql, { sleep: noSleep });
    expect(levels.map((level) => level.locationName)).toEqual(["Store"]);
  });

  it("only reads: every request is a query", async () => {
    const graphql = fakeShopify([[WAREHOUSE]], { [WAREHOUSE.id]: [[levelNode(1)]] });
    await fetchLiveInventory(graphql, { sleep: noSleep });
    for (const [query] of graphql.mock.calls) expect(query.trimStart()).toMatch(/^#graphql\s+query /);
  });
});

describe("toInventoryLevel", () => {
  const location = { id: "gid://shopify/Location/1", name: "Warehouse" };

  it("reads the vendor and cost per item", () => {
    expect(toInventoryLevel(levelNode(1), location)).toMatchObject({
      vendor: "Acme Supply",
      unitCost: { amount: 6.5, currencyCode: "USD" },
    });
  });

  it("treats a missing or zero cost as not set", () => {
    const noCost = levelNode(1);
    expect(toInventoryLevel({ ...noCost, item: { ...noCost.item, unitCost: null } }, location)?.unitCost).toBeNull();
    expect(
      toInventoryLevel({ ...noCost, item: { ...noCost.item, unitCost: { amount: "0.00", currencyCode: "USD" } } }, location)
        ?.unitCost,
    ).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { fetchSalesHistory, orderLocation, type OrderNode } from "./sales";

type Graphql = Parameters<typeof fetchSalesHistory>[0];

function order(
  lines: [variantId: string | null, quantity: number][],
  { location = "loc-a" as string | null, test = false, cancelled = false, moreLines = false, pos = null as string | null } = {},
): OrderNode {
  return {
    cancelledAt: cancelled ? "2026-10-20T00:00:00Z" : null,
    test,
    retailLocation: pos ? { id: pos } : null,
    fulfillments: location ? [{ status: "SUCCESS", location: { id: location } }] : [],
    lineItems: {
      pageInfo: { hasNextPage: moreLines },
      nodes: lines.map(([variantId, quantity]) => ({
        currentQuantity: quantity,
        variant: variantId ? { id: variantId } : null,
      })),
    },
  };
}

/** Each inner array is one page of orders. */
function fakeOrders(pages: OrderNode[][]) {
  const graphql = vi.fn(async (_query: string, variables?: Record<string, unknown>) => {
    const page = variables?.after ? Number(variables.after) : 0;
    return {
      data: {
        orders: {
          pageInfo: { hasNextPage: page + 1 < pages.length, endCursor: String(page + 1) },
          nodes: pages[page],
        },
      },
      cost: null,
      apiVersion: null,
    };
  });
  return graphql as unknown as Graphql & typeof graphql;
}

const NOW = new Date("2026-10-29T12:00:00Z");

describe("fetchSalesHistory", () => {
  it("adds up units per variant and location across pages, since 30 days ago", async () => {
    const graphql = fakeOrders([
      [order([["v1", 2], ["v2", 1]]), order([["v1", 3]], { location: "loc-b" })],
      [order([["v1", 4]], { location: null })],
    ]);

    const history = await fetchSalesHistory(graphql, { now: NOW, sleep: async () => {} });

    expect(graphql.mock.calls[0][1]).toMatchObject({ query: "created_at:>='2026-09-29T12:00:00.000Z'" });
    expect(history).toMatchObject({ windowDays: 30, ordersCounted: 3, truncated: false });
    expect(history.variants).toEqual({
      v1: { byLocation: { "loc-a": 2, "loc-b": 3 }, unassigned: 4 },
      v2: { byLocation: { "loc-a": 1 }, unassigned: 0 },
    });
  });

  it("ignores test orders, cancelled orders, removed items and deleted variants", async () => {
    const graphql = fakeOrders([
      [
        order([["v1", 5]], { test: true }),
        order([["v1", 5]], { cancelled: true }),
        order([["v1", 0], [null, 2], ["v2", 1]]),
      ],
    ]);
    const history = await fetchSalesHistory(graphql, { now: NOW });
    expect(history.ordersCounted).toBe(1);
    expect(history.variants).toEqual({ v2: { byLocation: { "loc-a": 1 }, unassigned: 0 } });
  });

  it("flags orders with more line items than were read", async () => {
    const graphql = fakeOrders([[order([["v1", 1]], { moreLines: true })]]);
    expect((await fetchSalesHistory(graphql, { now: NOW })).truncated).toBe(true);
  });

  it("stops at the order limit and says demand may be understated", async () => {
    const graphql = fakeOrders([[order([["v1", 1]])], [order([["v1", 1]])], [order([["v1", 1]])]]);
    const history = await fetchSalesHistory(graphql, { now: NOW, maxOrders: 2, sleep: async () => {} });
    expect(history).toMatchObject({ ordersCounted: 2, truncated: true });
  });
});

describe("orderLocation", () => {
  it("uses the shipping location, then the POS location, else none", () => {
    expect(orderLocation(order([], { location: "loc-a" }))).toBe("loc-a");
    expect(orderLocation(order([], { location: null, pos: "store-1" }))).toBe("store-1");
    expect(orderLocation(order([], { location: null }))).toBeNull();
  });

  it("skips cancelled fulfillments", () => {
    const shipped = { ...order([]), fulfillments: [{ status: "CANCELLED", location: { id: "old" } }, { status: "SUCCESS", location: { id: "new" } }] };
    expect(orderLocation(shipped)).toBe("new");
  });
});

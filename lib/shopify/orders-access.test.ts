import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "./admin-graphql";
import { probeOrdersAccess } from "./orders-access";

type Graphql = Parameters<typeof probeOrdersAccess>[0];

const graphqlThatThrows = (error: Error) => vi.fn(async () => Promise.reject(error));

describe("probeOrdersAccess", () => {
  it("reports access when the orders query succeeds", async () => {
    const graphql = vi.fn(async () => ({ data: { orders: { nodes: [] } }, cost: null, apiVersion: "2026-10" }));
    expect(await probeOrdersAccess(graphql as unknown as Graphql)).toEqual({ status: "granted", message: null });
  });

  it("recognises Shopify's protected customer data denial and keeps its message", async () => {
    const denied = new AdminApiError("This app is not approved to access the Order object.", 200, "ACCESS_DENIED");
    expect(await probeOrdersAccess(graphqlThatThrows(denied))).toEqual({
      status: "not_approved",
      message: "This app is not approved to access the Order object.",
    });
  });

  it("doesn't guess when the probe fails for another reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await probeOrdersAccess(graphqlThatThrows(new AdminApiError("Timeout", null)))).toMatchObject({
      status: "unknown",
    });
  });
});

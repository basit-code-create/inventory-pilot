import { describe, expect, it, vi } from "vitest";
import { queueFetch, TEST_SHOP } from "../../test/shopify-fixtures";
import { AccessTokenRejectedError, AdminApiError, adminGraphql } from "./admin-graphql";

function request(fetchImpl: typeof fetch, sleep = vi.fn(async () => {})) {
  return { shop: TEST_SHOP, accessToken: "shpat_x", apiVersion: "2026-10", query: "{ shop { name } }", fetchImpl, sleep };
}

const ok = (data: unknown, headers: HeadersInit = { "X-Shopify-API-Version": "2026-10" }) =>
  Response.json({ data }, { headers });

describe("adminGraphql", () => {
  it("posts the query with the access token to the versioned endpoint", async () => {
    const { fetchImpl, calls } = queueFetch(ok({ shop: { name: "Demo" } }));
    const result = await adminGraphql<{ shop: { name: string } }>(request(fetchImpl));

    expect(calls[0].url).toBe(`https://${TEST_SHOP}/admin/api/2026-10/graphql.json`);
    expect(new Headers(calls[0].init?.headers).get("X-Shopify-Access-Token")).toBe("shpat_x");
    expect(result).toMatchObject({ data: { shop: { name: "Demo" } }, apiVersion: "2026-10" });
  });

  it("reports a rejected access token", async () => {
    const { fetchImpl } = queueFetch(new Response(null, { status: 401 }));
    await expect(adminGraphql(request(fetchImpl))).rejects.toBeInstanceOf(AccessTokenRejectedError);
  });

  it("retries 5xx and 429 responses, honouring Retry-After", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = queueFetch(
      new Response(null, { status: 503 }),
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
      ok({ shop: { name: "Demo" } }),
    );
    await adminGraphql(request(fetchImpl, sleep));
    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenLastCalledWith(2000);
  });

  it("waits for the bucket to refill when throttled", async () => {
    const sleep = vi.fn(async () => {});
    const throttled = Response.json({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      extensions: {
        cost: {
          requestedQueryCost: 202,
          actualQueryCost: null,
          throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 2, restoreRate: 100 },
        },
      },
    });
    const { fetchImpl } = queueFetch(throttled, ok({ shop: { name: "Demo" } }));
    await adminGraphql(request(fetchImpl, sleep));
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after the last attempt", async () => {
    const { fetchImpl } = queueFetch(...Array.from({ length: 4 }, () => new Response(null, { status: 500 })));
    await expect(adminGraphql(request(fetchImpl))).rejects.toThrow(/500 after 4 attempts/);
  });

  it("surfaces GraphQL errors", async () => {
    const { fetchImpl } = queueFetch(
      Response.json({ errors: [{ message: "Access denied for orders field.", extensions: { code: "ACCESS_DENIED" } }] }),
    );
    const error = await adminGraphql(request(fetchImpl)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ code: "ACCESS_DENIED", message: "Access denied for orders field." });
  });
});

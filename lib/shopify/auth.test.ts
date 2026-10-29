import { describe, expect, it, vi } from "vitest";
import { noSleep, queueFetch, signSessionToken, TEST_CONFIG, TEST_SHOP, tokenResponse } from "../../test/shopify-fixtures";
import { createShopifyAuth } from "./auth";
import { ConfigError } from "./config";
import { RETRY_INVALID_SESSION_HEADER } from "./shared";
import { createMemoryTokenStore } from "./token-store";

const shopData = () => Response.json({ data: { shop: { name: "Demo Shop" } } });

function setup(...responses: Parameters<typeof queueFetch>) {
  const { fetchImpl, calls } = queueFetch(...responses);
  const store = createMemoryTokenStore();
  const withShopifyAuth = createShopifyAuth({ getConfig: () => TEST_CONFIG, getStore: () => store, fetchImpl, sleep: noSleep });
  const handler = vi.fn(async (_request: Request, admin: Parameters<Parameters<typeof withShopifyAuth>[0]>[1]) => {
    const { data } = await admin.graphql<{ shop: { name: string } }>("{ shop { name } }");
    return Response.json({ shop: admin.shop, name: data.shop.name });
  });
  return { route: withShopifyAuth(handler), handler, calls, store };
}

const requestWith = (authorization?: string) =>
  new Request("https://app.example.com/api/shopify/status", {
    headers: authorization ? { Authorization: authorization } : {},
  });

describe("withShopifyAuth", () => {
  it("asks App Bridge to retry when the session token is missing", async () => {
    const { route, handler } = setup();
    const response = await route(requestWith());
    expect(response.status).toBe(401);
    expect(response.headers.get(RETRY_INVALID_SESSION_HEADER)).toBe("1");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an invalid session token before calling Shopify", async () => {
    const { route, calls } = setup();
    const forged = await signSessionToken({}, { secret: "forged-secret-0123456789abcdef0123456789" });
    const response = await route(requestWith(`Bearer ${forged}`));
    expect(response.status).toBe(401);
    expect(response.headers.get(RETRY_INVALID_SESSION_HEADER)).toBe("1");
    expect(calls).toHaveLength(0);
  });

  it("exchanges the session token, then runs the handler with an Admin API client", async () => {
    const { route, calls, store } = setup(tokenResponse(), shopData(), shopData());
    const authorization = `Bearer ${await signSessionToken()}`;

    const first = await route(requestWith(authorization));
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(await first.json()).toEqual({ shop: TEST_SHOP, name: "Demo Shop" });
    expect(new Headers(calls[1].init?.headers).get("X-Shopify-Access-Token")).toBe("shpat_new");
    expect((await store.get(TEST_SHOP))?.accessToken).toBe("shpat_new");

    // The stored token is reused: no second exchange.
    await route(requestWith(authorization));
    expect(calls.map((call) => call.url.endsWith("/admin/oauth/access_token"))).toEqual([true, false, false]);
  });

  it("asks for a fresh session token when Shopify rejects it in the exchange", async () => {
    const { route } = setup(Response.json({ error: "invalid_subject_token" }, { status: 400 }));
    const response = await route(requestWith(`Bearer ${await signSessionToken()}`));
    expect(response.status).toBe(401);
    expect(response.headers.get(RETRY_INVALID_SESSION_HEADER)).toBe("1");
  });

  it("mints a new token and retries once when the Admin API rejects the stored one", async () => {
    const { route, calls } = setup(
      tokenResponse({ access_token: "shpat_first" }),
      new Response(null, { status: 401 }),
      tokenResponse({ access_token: "shpat_second" }),
      shopData(),
    );
    const response = await route(requestWith(`Bearer ${await signSessionToken()}`));
    expect(response.status).toBe(200);
    expect(new Headers(calls[3].init?.headers).get("X-Shopify-Access-Token")).toBe("shpat_second");
  });

  it("reports missing configuration without leaking values", async () => {
    const withShopifyAuth = createShopifyAuth({
      getConfig: () => {
        throw new ConfigError("Missing environment variables: SHOPIFY_CLIENT_SECRET.");
      },
      getStore: createMemoryTokenStore,
    });
    const response = await withShopifyAuth(async () => new Response("unreachable"))(requestWith("Bearer x"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "server_misconfigured" });
  });

  it("returns 502 when the Admin API keeps failing", async () => {
    const { route } = setup(tokenResponse(), ...Array.from({ length: 4 }, () => new Response(null, { status: 500 })));
    const response = await route(requestWith(`Bearer ${await signSessionToken()}`));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ connected: false, error: "admin_api_error" });
  });
});

import { describe, expect, it } from "vitest";
import { formBody, noSleep, queueFetch, TEST_CONFIG, TEST_SHOP, tokenResponse } from "../../test/shopify-fixtures";
import {
  getOfflineTokenForBackground,
  getOfflineTokenForRequest,
  ReauthorizationRequiredError,
} from "./offline-token";
import { createMemoryTokenStore, type StoredOfflineToken } from "./token-store";

const NOW = 1_800_000_000_000;

function storedToken(overrides: Partial<StoredOfflineToken> = {}): StoredOfflineToken {
  return {
    shop: TEST_SHOP,
    accessToken: "shpat_stored",
    scope: "read_products,read_inventory,read_locations,read_orders",
    expiresAt: NOW + 30 * 60_000,
    refreshToken: "shprt_stored",
    refreshTokenExpiresAt: NOW + 30 * 86_400_000,
    updatedAt: NOW - 60_000,
    ...overrides,
  };
}

async function setup(fetchImpl: typeof fetch, existing?: StoredOfflineToken) {
  const store = createMemoryTokenStore();
  if (existing) await store.save(existing);
  return { store, deps: { config: TEST_CONFIG, store, fetchImpl, now: () => NOW, sleep: noSleep } };
}

describe("getOfflineTokenForRequest", () => {
  it("reuses a fresh stored token without calling Shopify", async () => {
    const { fetchImpl, calls } = queueFetch();
    const { deps } = await setup(fetchImpl, storedToken());
    expect((await getOfflineTokenForRequest(TEST_SHOP, "jwt", deps)).accessToken).toBe("shpat_stored");
    expect(calls).toHaveLength(0);
  });

  it("exchanges and stores a token when none is stored", async () => {
    const { fetchImpl } = queueFetch(tokenResponse());
    const { deps, store } = await setup(fetchImpl);
    const token = await getOfflineTokenForRequest(TEST_SHOP, "jwt", deps);
    expect(token.accessToken).toBe("shpat_new");
    expect(await store.get(TEST_SHOP)).toMatchObject({ accessToken: "shpat_new", refreshToken: "shprt_new" });
  });

  it("exchanges again when the stored token is within a minute of expiring", async () => {
    const { fetchImpl, calls } = queueFetch(tokenResponse());
    const { deps } = await setup(fetchImpl, storedToken({ expiresAt: NOW + 30_000 }));
    expect((await getOfflineTokenForRequest(TEST_SHOP, "jwt", deps)).accessToken).toBe("shpat_new");
    expect(formBody(calls[0].init).grant_type).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
  });

  it("ignores the stored token when asked for a new one", async () => {
    const { fetchImpl } = queueFetch(tokenResponse());
    const { deps } = await setup(fetchImpl, storedToken());
    const token = await getOfflineTokenForRequest(TEST_SHOP, "jwt", deps, { forceNew: true });
    expect(token.accessToken).toBe("shpat_new");
  });

  it("shares one exchange between concurrent requests for a shop", async () => {
    const { fetchImpl, calls } = queueFetch(tokenResponse());
    const { deps } = await setup(fetchImpl);
    const tokens = await Promise.all([
      getOfflineTokenForRequest(TEST_SHOP, "jwt-a", deps),
      getOfflineTokenForRequest(TEST_SHOP, "jwt-b", deps),
    ]);
    expect(calls).toHaveLength(1);
    expect(tokens.map((token) => token.accessToken)).toEqual(["shpat_new", "shpat_new"]);
  });

  it("retries transient failures", async () => {
    const { fetchImpl, calls } = queueFetch(new Response(null, { status: 502 }), tokenResponse());
    const { deps } = await setup(fetchImpl);
    expect((await getOfflineTokenForRequest(TEST_SHOP, "jwt", deps)).accessToken).toBe("shpat_new");
    expect(calls).toHaveLength(2);
  });
});

describe("getOfflineTokenForBackground", () => {
  it("reuses a fresh stored token", async () => {
    const { fetchImpl, calls } = queueFetch();
    const { deps } = await setup(fetchImpl, storedToken());
    expect((await getOfflineTokenForBackground(TEST_SHOP, deps)).accessToken).toBe("shpat_stored");
    expect(calls).toHaveLength(0);
  });

  it("refreshes an expired token and stores the rotated refresh token", async () => {
    const { fetchImpl, calls } = queueFetch(tokenResponse({ access_token: "shpat_refreshed", refresh_token: "shprt_rotated" }));
    const { deps, store } = await setup(fetchImpl, storedToken({ expiresAt: NOW - 1 }));
    expect((await getOfflineTokenForBackground(TEST_SHOP, deps)).accessToken).toBe("shpat_refreshed");
    expect(formBody(calls[0].init)).toMatchObject({ grant_type: "refresh_token", refresh_token: "shprt_stored" });
    expect((await store.get(TEST_SHOP))?.refreshToken).toBe("shprt_rotated");
  });

  it("deletes the token and asks for reauthorization when the refresh token is rejected", async () => {
    const { fetchImpl } = queueFetch(Response.json({ error: "invalid_request" }, { status: 401 }));
    const { deps, store } = await setup(fetchImpl, storedToken({ expiresAt: NOW - 1 }));
    await expect(getOfflineTokenForBackground(TEST_SHOP, deps)).rejects.toBeInstanceOf(ReauthorizationRequiredError);
    expect(await store.get(TEST_SHOP)).toBeNull();
  });

  it("asks for reauthorization without a stored token or with an expired refresh token", async () => {
    const empty = await setup(queueFetch().fetchImpl);
    await expect(getOfflineTokenForBackground(TEST_SHOP, empty.deps)).rejects.toBeInstanceOf(ReauthorizationRequiredError);

    const stale = await setup(queueFetch().fetchImpl, storedToken({ expiresAt: NOW - 1, refreshTokenExpiresAt: NOW - 1 }));
    await expect(getOfflineTokenForBackground(TEST_SHOP, stale.deps)).rejects.toBeInstanceOf(ReauthorizationRequiredError);
  });
});

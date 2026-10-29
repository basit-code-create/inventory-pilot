import { describe, expect, it } from "vitest";
import { formBody, queueFetch, TEST_CONFIG, TEST_SHOP, tokenResponse } from "../../test/shopify-fixtures";
import { exchangeSessionToken, refreshOfflineToken, TokenRequestError } from "./token-exchange";

const NOW = 1_800_000_000_000;

function deps(fetchImpl: typeof fetch) {
  return { config: TEST_CONFIG, fetchImpl, now: () => NOW };
}

async function failureKind(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(TokenRequestError);
  return (error as TokenRequestError).kind;
}

describe("exchangeSessionToken", () => {
  it("requests an expiring offline token with a form-encoded body", async () => {
    const { fetchImpl, calls } = queueFetch(tokenResponse());
    const token = await exchangeSessionToken(TEST_SHOP, "session.jwt", deps(fetchImpl));

    expect(calls[0].url).toBe(`https://${TEST_SHOP}/admin/oauth/access_token`);
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(formBody(calls[0].init)).toEqual({
      client_id: TEST_CONFIG.clientId,
      client_secret: TEST_CONFIG.clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: "session.jwt",
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    });
    expect(token).toEqual({
      accessToken: "shpat_new",
      scope: "read_products,read_inventory,read_locations,read_orders",
      expiresAt: NOW + 3_600_000,
      refreshToken: "shprt_new",
      refreshTokenExpiresAt: NOW + 7_776_000_000,
    });
  });

  it("treats a 400 as a stale session token", async () => {
    const { fetchImpl } = queueFetch(Response.json({ error: "invalid_subject_token" }, { status: 400 }));
    expect(await failureKind(exchangeSessionToken(TEST_SHOP, "old.jwt", deps(fetchImpl)))).toBe("invalid_subject_token");
  });

  it("treats network errors, 429 and 5xx as retryable", async () => {
    const network = queueFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await failureKind(exchangeSessionToken(TEST_SHOP, "jwt", deps(network.fetchImpl)))).toBe("retryable");

    const busy = queueFetch(new Response(null, { status: 503 }));
    expect(await failureKind(exchangeSessionToken(TEST_SHOP, "jwt", deps(busy.fetchImpl)))).toBe("retryable");
  });

  it("rejects a response without an access token", async () => {
    const { fetchImpl } = queueFetch(Response.json({ scope: "read_products" }));
    expect(await failureKind(exchangeSessionToken(TEST_SHOP, "jwt", deps(fetchImpl)))).toBe("failed");
  });

  it("never puts the client secret in error messages", async () => {
    const { fetchImpl } = queueFetch(Response.json({ error: "invalid_client" }, { status: 403 }));
    const error = await exchangeSessionToken(TEST_SHOP, "jwt", deps(fetchImpl)).catch((caught: Error) => caught);
    expect(String(error)).not.toContain(TEST_CONFIG.clientSecret);
  });
});

describe("refreshOfflineToken", () => {
  it("sends the refresh token grant", async () => {
    const { fetchImpl, calls } = queueFetch(tokenResponse({ access_token: "shpat_refreshed" }));
    const token = await refreshOfflineToken(TEST_SHOP, "shprt_old", deps(fetchImpl));

    expect(formBody(calls[0].init)).toEqual({
      client_id: TEST_CONFIG.clientId,
      client_secret: TEST_CONFIG.clientSecret,
      grant_type: "refresh_token",
      refresh_token: "shprt_old",
    });
    expect(token.accessToken).toBe("shpat_refreshed");
  });

  it("treats a 401 as terminal", async () => {
    const { fetchImpl } = queueFetch(Response.json({ error: "invalid_request" }, { status: 401 }));
    expect(await failureKind(refreshOfflineToken(TEST_SHOP, "shprt_dead", deps(fetchImpl)))).toBe("reauthorize");
  });
});

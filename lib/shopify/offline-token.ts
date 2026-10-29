import "server-only";

import {
  exchangeSessionToken,
  refreshOfflineToken,
  TokenRequestError,
  type OfflineToken,
  type TokenEndpointDeps,
} from "./token-exchange";
import type { StoredOfflineToken, TokenStore } from "./token-store";

// Replace tokens a minute early so a request never starts with a token about to expire.
const EXPIRY_BUFFER_MS = 60_000;
const MAX_ATTEMPTS = 3;

export class ReauthorizationRequiredError extends Error {
  override name = "ReauthorizationRequiredError";
  constructor(shop: string, reason: string) {
    super(`No usable access token for ${shop}: ${reason}. A merchant must open the app from the Shopify admin.`);
  }
}

export interface OfflineTokenDeps extends TokenEndpointDeps {
  store: TokenStore;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/*
 * Acquiring a token retires the shop's previous refresh token, so acquiring and refreshing for
 * the same shop must never overlap. Concurrent callers share the in-flight request instead.
 */
const inFlight = new Map<string, Promise<StoredOfflineToken>>();

function singleFlight(shop: string, task: () => Promise<StoredOfflineToken>): Promise<StoredOfflineToken> {
  const existing = inFlight.get(shop);
  if (existing) return existing;
  const promise = task().finally(() => inFlight.delete(shop));
  inFlight.set(shop, promise);
  return promise;
}

async function withRetries<T>(task: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const retryable = error instanceof TokenRequestError && error.kind === "retryable";
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }
}

function isFresh(token: OfflineToken, now: number): boolean {
  return token.expiresAt === null || token.expiresAt - EXPIRY_BUFFER_MS > now;
}

async function saveToken(shop: string, token: OfflineToken, deps: OfflineTokenDeps): Promise<StoredOfflineToken> {
  const stored: StoredOfflineToken = { ...token, shop, updatedAt: deps.now?.() ?? Date.now() };
  await deps.store.save(stored);
  return stored;
}

/**
 * For requests made while a merchant is using the app. Reuses the stored token while it is
 * fresh; otherwise exchanges this request's session token for a new one, as Shopify
 * recommends during an active session. `forceNew` skips the stored token after Shopify
 * rejected it (revoked, or the app's scopes changed).
 */
export async function getOfflineTokenForRequest(
  shop: string,
  sessionToken: string,
  deps: OfflineTokenDeps,
  options: { forceNew?: boolean } = {},
): Promise<StoredOfflineToken> {
  if (!options.forceNew) {
    const stored = await deps.store.get(shop);
    if (stored && isFresh(stored, deps.now?.() ?? Date.now())) return stored;
  }

  return singleFlight(shop, async () => {
    const token = await withRetries(() => exchangeSessionToken(shop, sessionToken, deps), deps.sleep ?? defaultSleep);
    return saveToken(shop, token, deps);
  });
}

/** For work with no merchant session, such as webhooks: renews the token with the stored refresh token. */
export async function getOfflineTokenForBackground(
  shop: string,
  deps: OfflineTokenDeps,
): Promise<StoredOfflineToken> {
  const now = deps.now?.() ?? Date.now();
  const stored = await deps.store.get(shop);
  if (!stored) throw new ReauthorizationRequiredError(shop, "no token is stored");
  if (isFresh(stored, now)) return stored;

  const { refreshToken } = stored;
  if (!refreshToken || (stored.refreshTokenExpiresAt !== null && stored.refreshTokenExpiresAt <= now)) {
    throw new ReauthorizationRequiredError(shop, "the refresh token is missing or expired");
  }

  return singleFlight(shop, async () => {
    try {
      const token = await withRetries(() => refreshOfflineToken(shop, refreshToken, deps), deps.sleep ?? defaultSleep);
      return await saveToken(shop, { ...token, refreshToken: token.refreshToken ?? refreshToken }, deps);
    } catch (error) {
      if (error instanceof TokenRequestError && error.kind === "reauthorize") {
        await deps.store.delete(shop);
        throw new ReauthorizationRequiredError(shop, "Shopify rejected the refresh token");
      }
      throw error;
    }
  });
}

import "server-only";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const OFFLINE_ACCESS_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";
const REQUEST_TIMEOUT_MS = 30_000;

export interface OfflineToken {
  accessToken: string;
  scope: string;
  /** Epoch ms, or null for a token that doesn't expire. */
  expiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
}

export interface TokenEndpointDeps {
  config: { clientId: string; clientSecret: string };
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * invalid_subject_token: the session token was stale; get a fresh one and try again.
 * reauthorize: the refresh token is dead; a merchant must open the app to mint a new token.
 * retryable: network error, 429 or 5xx; the same request may succeed later.
 */
export type TokenRequestFailure = "invalid_subject_token" | "reauthorize" | "retryable" | "failed";

export class TokenRequestError extends Error {
  override name = "TokenRequestError";
  constructor(
    readonly kind: TokenRequestFailure,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

async function describeErrorBody(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const { error, error_description: description } = body as Record<string, unknown>;
      return [error, description].filter((part) => typeof part === "string").join(": ").slice(0, 200);
    }
  } catch {
    // Not JSON; the status code is enough.
  }
  return "";
}

function secondsFrom(now: number, seconds: unknown): number | null {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? now + value * 1000 : null;
}

async function requestToken(
  shop: string,
  params: Record<string, string>,
  classify: (status: number) => TokenRequestFailure,
  deps: TokenEndpointDeps,
): Promise<OfflineToken> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: deps.config.clientId,
        client_secret: deps.config.clientSecret,
        ...params,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new TokenRequestError("retryable", null, `Couldn't reach Shopify's token endpoint: ${reason}`);
  }

  if (!response.ok) {
    const detail = await describeErrorBody(response);
    const kind = response.status === 429 || response.status >= 500 ? "retryable" : classify(response.status);
    throw new TokenRequestError(
      kind,
      response.status,
      `Shopify's token endpoint returned ${response.status}${detail ? ` (${detail})` : ""}.`,
    );
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.access_token !== "string" || typeof body.scope !== "string") {
    throw new TokenRequestError("failed", response.status, "Shopify's token response was missing access_token or scope.");
  }

  const now = deps.now?.() ?? Date.now();
  return {
    accessToken: body.access_token,
    scope: body.scope,
    expiresAt: secondsFrom(now, body.expires_in),
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    refreshTokenExpiresAt: secondsFrom(now, body.refresh_token_expires_in),
  };
}

/** Exchanges an App Bridge session token for an expiring offline access token. */
export function exchangeSessionToken(
  shop: string,
  sessionToken: string,
  deps: TokenEndpointDeps,
): Promise<OfflineToken> {
  return requestToken(
    shop,
    {
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: sessionToken,
      subject_token_type: ID_TOKEN_TYPE,
      requested_token_type: OFFLINE_ACCESS_TOKEN_TYPE,
      expiring: "1",
    },
    // Shopify answers 400 when the ID token is expired or invalid.
    (status) => (status === 400 ? "invalid_subject_token" : "failed"),
    deps,
  );
}

/** Renews an expiring offline token without a merchant session, e.g. for webhooks and background jobs. */
export function refreshOfflineToken(
  shop: string,
  refreshToken: string,
  deps: TokenEndpointDeps,
): Promise<OfflineToken> {
  return requestToken(
    shop,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    // A 401 means the refresh token can never be used again.
    (status) => (status === 401 ? "reauthorize" : "failed"),
    deps,
  );
}

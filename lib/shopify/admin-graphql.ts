import "server-only";

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 4;

export class AdminApiError extends Error {
  override name = "AdminApiError";
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

/** 401 from the Admin API: the token was revoked, expired, or the app's scopes changed. */
export class AccessTokenRejectedError extends AdminApiError {
  override name = "AccessTokenRejectedError";
}

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface QueryCost {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: ThrottleStatus;
}

export interface GraphqlResult<T> {
  data: T;
  cost: QueryCost | null;
  /** The version Shopify actually served, which differs from the requested one if that is unsupported. */
  apiVersion: string | null;
}

interface GraphqlError {
  message: string;
  extensions?: { code?: string };
}

interface GraphqlBody<T> {
  data?: T;
  errors?: GraphqlError[];
  extensions?: { cost?: QueryCost };
}

export interface AdminGraphqlRequest {
  shop: string;
  accessToken: string;
  apiVersion: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

/** Waits until the leaky bucket has restored enough points for the query that was throttled. */
function throttleDelayMs(cost: QueryCost | undefined, attempt: number): number {
  if (!cost || cost.throttleStatus.restoreRate <= 0) return backoffMs(attempt, null);
  const shortfall = cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable;
  return Math.min(Math.max(shortfall / cost.throttleStatus.restoreRate, 1) * 1000, 30_000);
}

/**
 * For multi-page reads: waits if the query-cost bucket can't cover another query like the last
 * one, so a long sync slows down instead of getting throttled.
 */
export async function waitForQueryBudget(cost: QueryCost | null, sleep: (ms: number) => Promise<void>) {
  if (!cost) return;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const shortfall = cost.requestedQueryCost - currentlyAvailable;
  if (shortfall > 0 && restoreRate > 0) await sleep(Math.ceil((shortfall / restoreRate) * 1000));
}

export async function adminGraphql<T>(request: AdminGraphqlRequest): Promise<GraphqlResult<T>> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const sleep = request.sleep ?? defaultSleep;
  const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const url = `https://${request.shop}/admin/api/${request.apiVersion}/graphql.json`;

  for (let attempt = 1; ; attempt++) {
    const canRetry = attempt < maxAttempts;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": request.accessToken,
        },
        body: JSON.stringify({ query: request.query, variables: request.variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (canRetry) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      const reason = error instanceof Error ? error.message : "network error";
      throw new AdminApiError(`Couldn't reach the Shopify Admin API: ${reason}`, null);
    }

    if (response.status === 401) {
      throw new AccessTokenRejectedError("Shopify rejected the access token.", 401);
    }
    if (response.status === 429 || response.status >= 500) {
      if (canRetry) {
        await sleep(backoffMs(attempt, response.headers.get("Retry-After")));
        continue;
      }
      throw new AdminApiError(`The Shopify Admin API returned ${response.status} after ${attempt} attempts.`, response.status);
    }
    if (!response.ok) {
      // 402 (store frozen), 403 (missing scope), 404 (store not found), 423 (store locked).
      throw new AdminApiError(`The Shopify Admin API returned ${response.status}.`, response.status);
    }

    const body = (await response.json()) as GraphqlBody<T>;
    if (body.errors?.length) {
      const throttled = body.errors.some((error) => error.extensions?.code === "THROTTLED");
      if (throttled && canRetry) {
        await sleep(throttleDelayMs(body.extensions?.cost, attempt));
        continue;
      }
      throw new AdminApiError(
        body.errors.map((error) => error.message).join(" "),
        response.status,
        body.errors[0].extensions?.code ?? null,
      );
    }
    if (body.data === undefined) {
      throw new AdminApiError("The Shopify Admin API response had no data.", response.status);
    }

    return {
      data: body.data,
      cost: body.extensions?.cost ?? null,
      apiVersion: response.headers.get("X-Shopify-API-Version"),
    };
  }
}

import "server-only";

import { unstable_rethrow } from "next/navigation";
import { isMongoError } from "../db/mongodb";
import { AccessTokenRejectedError, AdminApiError, adminGraphql, type GraphqlResult } from "./admin-graphql";
import { ConfigError, getShopifyConfig, type ShopifyConfig } from "./config";
import { createMongoTokenStore } from "./mongo-token-store";
import { getOfflineTokenForRequest } from "./offline-token";
import { InvalidSessionTokenError, readBearerToken, verifySessionToken, type SessionToken } from "./session-token";
import { RETRY_INVALID_SESSION_HEADER } from "./shared";
import { TokenRequestError } from "./token-exchange";
import type { StoredOfflineToken, TokenStore } from "./token-store";

export interface ShopifyAdminContext {
  shop: string;
  session: SessionToken;
  apiVersion: string;
  /** SHOPIFY_APP_URL as an https origin, or null if unset. */
  appUrl: string | null;
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<GraphqlResult<T>>;
}

type AuthenticatedHandler = (request: Request, admin: ShopifyAdminContext) => Promise<Response>;

export interface ShopifyAuthDeps {
  getConfig: () => ShopifyConfig;
  /** Tokens belong to one app, so the store is chosen by the configured client ID. */
  getStore: (config: ShopifyConfig) => TokenStore;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function errorJson(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return Response.json(
    { connected: false, error, message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/** 401 plus the retry header, so App Bridge gets a fresh session token and retries once. */
function invalidSession(message: string): Response {
  return errorJson(401, "invalid_session_token", message, { [RETRY_INVALID_SESSION_HEADER]: "1" });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof InvalidSessionTokenError) return invalidSession(error.message);
  if (error instanceof ConfigError) return errorJson(500, "server_misconfigured", error.message);
  if (error instanceof TokenRequestError) {
    if (error.kind === "invalid_subject_token") return invalidSession(error.message);
    if (error.kind === "retryable") return errorJson(503, "shopify_unavailable", error.message);
    return errorJson(502, "token_exchange_failed", error.message);
  }
  if (error instanceof AdminApiError) return errorJson(502, "admin_api_error", error.message);
  if (isMongoError(error)) return errorJson(503, "database_unavailable", "Couldn't reach the database.");
  return errorJson(500, "internal_error", "Something went wrong on the server.");
}

/**
 * Wraps a route handler so it only runs for a request carrying a valid App Bridge session
 * token, and gives it an Admin API client authorised with the shop's offline token.
 */
export function createShopifyAuth(deps: ShopifyAuthDeps) {
  return function withShopifyAuth(handler: AuthenticatedHandler) {
    return async function authenticatedRoute(request: Request): Promise<Response> {
      try {
        const config = deps.getConfig();
        const sessionToken = readBearerToken(request.headers.get("authorization"));
        if (!sessionToken) return invalidSession("Missing session token.");

        const session = await verifySessionToken(sessionToken, config);
        const tokenDeps = { config, store: deps.getStore(config), fetchImpl: deps.fetchImpl, now: deps.now, sleep: deps.sleep };
        // Acquired on the first Admin API call, so routes that only read app data never exchange tokens.
        let offlineToken: Promise<StoredOfflineToken> | null = null;
        const tokenFor = (forceNew: boolean) =>
          (offlineToken = getOfflineTokenForRequest(session.shop, sessionToken, tokenDeps, { forceNew }));

        const run = async <T>(token: Promise<StoredOfflineToken>, query: string, variables?: Record<string, unknown>) =>
          adminGraphql<T>({
            shop: session.shop,
            accessToken: (await token).accessToken,
            apiVersion: config.apiVersion,
            query,
            variables,
            fetchImpl: deps.fetchImpl,
            sleep: deps.sleep,
          });

        const graphql = async <T>(query: string, variables?: Record<string, unknown>) => {
          try {
            return await run<T>(offlineToken ?? tokenFor(false), query, variables);
          } catch (error) {
            if (!(error instanceof AccessTokenRejectedError)) throw error;
            // Revoked, or the app's scopes changed: mint a new token from this session and retry once.
            return run<T>(tokenFor(true), query, variables);
          }
        };

        const response = await handler(request, {
          shop: session.shop,
          session,
          apiVersion: config.apiVersion,
          appUrl: config.appUrl,
          graphql,
        });
        response.headers.set("Cache-Control", "no-store");
        return response;
      } catch (error) {
        // Let Next.js handle its own control-flow errors, such as bailing out of prerendering.
        unstable_rethrow(error);
        // Never log tokens; these messages only describe what failed.
        console.error(`[shopify-auth] ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
        return toErrorResponse(error);
      }
    };
  };
}

const mongoStores = new Map<string, TokenStore>();

/** The offline-token store for one app (client ID), shared by requests and webhooks. */
export function getTokenStore(clientId: string): TokenStore {
  let store = mongoStores.get(clientId);
  if (!store) {
    store = createMongoTokenStore(clientId);
    mongoStores.set(clientId, store);
  }
  return store;
}

export const withShopifyAuth = createShopifyAuth({
  getConfig: () => getShopifyConfig(),
  getStore: ({ clientId }) => getTokenStore(clientId),
});

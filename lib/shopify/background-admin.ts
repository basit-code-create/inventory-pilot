import "server-only";

import { AccessTokenRejectedError, adminGraphql, type GraphqlResult } from "./admin-graphql";
import type { ShopifyAdminContext } from "./auth";
import type { ShopifyConfig } from "./config";
import { getOfflineTokenForBackground, ReauthorizationRequiredError } from "./offline-token";
import type { TokenStore } from "./token-store";

/**
 * An Admin API client for work without a merchant session, such as webhooks. It renews the
 * stored offline token with its refresh token; if Shopify rejects the token outright there is no
 * session token to exchange, so the shop must open the app again.
 */
export function createBackgroundGraphql(
  shop: string,
  config: ShopifyConfig,
  store: TokenStore,
): ShopifyAdminContext["graphql"] {
  return async <T>(query: string, variables?: Record<string, unknown>): Promise<GraphqlResult<T>> => {
    const token = await getOfflineTokenForBackground(shop, { config, store });
    try {
      return await adminGraphql<T>({ shop, accessToken: token.accessToken, apiVersion: config.apiVersion, query, variables });
    } catch (error) {
      if (error instanceof AccessTokenRejectedError) {
        await store.delete(shop);
        throw new ReauthorizationRequiredError(shop, "Shopify rejected the stored token");
      }
      throw error;
    }
  };
}

import { withShopifyAuth, type ShopifyAdminContext } from "@/lib/shopify/auth";
import { ensureWebhookSubscriptions } from "@/lib/shopify/webhooks";
import { probeOrdersAccess } from "@/lib/shopify/orders-access";
import { findExtraScopes, findMissingScopes } from "@/lib/shopify/scopes";
import type { ShopifyStatusResponse, WebhookStatus } from "@/lib/shopify/shared";

const STATUS_QUERY = `#graphql
  query AppConnectionStatus {
    shop {
      name
      myshopifyDomain
    }
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

interface StatusData {
  shop: { name: string; myshopifyDomain: string };
  currentAppInstallation: { accessScopes: { handle: string }[] };
}

/** Proves the connection end to end: session token → offline token → a live Admin API query. */
export const GET = withShopifyAuth(async (_request, { graphql, apiVersion, appUrl, shop }) => {
  const { data, apiVersion: servedVersion } = await graphql<StatusData>(STATUS_QUERY);
  const grantedScopes = data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
  const ordersAccess = await probeOrdersAccess(graphql);
  const webhooks = await checkWebhooks(shop, graphql, appUrl);

  return Response.json({
    connected: true,
    shop: { name: data.shop.name, domain: data.shop.myshopifyDomain },
    grantedScopes,
    missingScopes: findMissingScopes(grantedScopes),
    extraScopes: findExtraScopes(grantedScopes),
    ordersAccess,
    apiVersion: { requested: apiVersion, served: servedVersion },
    webhooks,
  } satisfies ShopifyStatusResponse);
});

/** Runs on every app open, so subscriptions follow the dev tunnel when its URL changes. Never fails the status check. */
async function checkWebhooks(
  shop: string,
  graphql: ShopifyAdminContext["graphql"],
  appUrl: string | null,
): Promise<WebhookStatus> {
  if (!appUrl) {
    return { status: "not_configured", message: "SHOPIFY_APP_URL isn't set to this app's https URL." };
  }
  try {
    await ensureWebhookSubscriptions(shop, graphql, appUrl);
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

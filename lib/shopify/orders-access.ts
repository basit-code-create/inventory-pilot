import "server-only";

import { AdminApiError } from "./admin-graphql";
import type { ShopifyAdminContext } from "./auth";
import type { OrdersAccess } from "./shared";

const ORDERS_PROBE = `#graphql
  query OrdersAccessProbe {
    orders(first: 1) {
      nodes {
        id
      }
    }
  }
`;

/**
 * Orders are protected customer data: even with read_orders, Shopify answers with an
 * ACCESS_DENIED error ("This app is not approved to access the Order object") until the
 * app has protected customer data access.
 */
export async function probeOrdersAccess(graphql: ShopifyAdminContext["graphql"]): Promise<OrdersAccess> {
  try {
    await graphql(ORDERS_PROBE);
    return { status: "granted", message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AdminApiError && (error.code === "ACCESS_DENIED" || /not approved/i.test(message))) {
      return { status: "not_approved", message };
    }
    console.warn(`[orders-access] ${message}`);
    return { status: "unknown", message };
  }
}

import "server-only";

import type { SalesHistory, VariantSales } from "../inventory/types";
import { waitForQueryBudget, type GraphqlResult } from "./admin-graphql";
import type { ShopifyAdminContext } from "./auth";

export const SALES_WINDOW_DAYS = 30;
// 10 orders × 40 line items keeps the requested cost under Shopify's 1,000-point limit per query.
const ORDERS_PAGE_SIZE = 10;
const LINE_ITEMS_PER_ORDER = 40;
/** Bigger stores would need Bulk Operations; past this, demand is marked as possibly understated. */
const MAX_ORDERS = 2_500;

const ORDERS_QUERY = `#graphql
  query RecentOrderSales($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        cancelledAt
        test
        retailLocation {
          id
        }
        fulfillments(first: 3) {
          status
          location {
            id
          }
        }
        lineItems(first: ${LINE_ITEMS_PER_ORDER}) {
          pageInfo {
            hasNextPage
          }
          nodes {
            currentQuantity
            variant {
              id
            }
          }
        }
      }
    }
  }
`;

export interface OrderNode {
  cancelledAt: string | null;
  test: boolean;
  retailLocation: { id: string } | null;
  fulfillments: { status: string; location: { id: string } | null }[];
  lineItems: {
    pageInfo: { hasNextPage: boolean };
    nodes: { currentQuantity: number; variant: { id: string } | null }[];
  };
}

interface OrdersData {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
}

const FAILED_FULFILLMENT = new Set(["CANCELLED", "ERROR", "FAILURE"]);

/** The location an order's units count against: where it shipped from, or the POS location it was sold at. */
export function orderLocation(order: OrderNode): string | null {
  const shipped = order.fulfillments.find((fulfillment) => !FAILED_FULFILLMENT.has(fulfillment.status));
  return shipped?.location?.id ?? order.retailLocation?.id ?? null;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FetchSalesOptions {
  now?: Date;
  windowDays?: number;
  maxOrders?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Units sold per variant over the last `windowDays`, from orders. Test and cancelled orders don't
 * count, and currentQuantity already leaves out items removed from an order. Read-only.
 * Throws AdminApiError with code ACCESS_DENIED when protected customer data isn't approved.
 */
export async function fetchSalesHistory(
  graphql: ShopifyAdminContext["graphql"],
  { now = new Date(), windowDays = SALES_WINDOW_DAYS, maxOrders = MAX_ORDERS, sleep = defaultSleep }: FetchSalesOptions = {},
): Promise<SalesHistory> {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const variants: Record<string, VariantSales> = {};
  let ordersCounted = 0;
  let ordersRead = 0;
  let truncated = false;
  let cursor: string | null = null;

  do {
    const page: GraphqlResult<OrdersData> = await graphql<OrdersData>(ORDERS_QUERY, {
      first: ORDERS_PAGE_SIZE,
      after: cursor,
      query: `created_at:>='${since}'`,
    });

    for (const order of page.data.orders.nodes) {
      ordersRead += 1;
      if (order.test || order.cancelledAt) continue;
      ordersCounted += 1;
      if (order.lineItems.pageInfo.hasNextPage) truncated = true;

      const locationId = orderLocation(order);
      for (const item of order.lineItems.nodes) {
        if (!item.variant || item.currentQuantity <= 0) continue;
        const sales = (variants[item.variant.id] ??= { byLocation: {}, unassigned: 0 });
        if (locationId) sales.byLocation[locationId] = (sales.byLocation[locationId] ?? 0) + item.currentQuantity;
        else sales.unassigned += item.currentQuantity;
      }
    }

    cursor = page.data.orders.pageInfo.hasNextPage ? page.data.orders.pageInfo.endCursor : null;
    if (cursor && ordersRead >= maxOrders) {
      truncated = true;
      break;
    }
    if (cursor) await waitForQueryBudget(page.cost, sleep);
  } while (cursor);

  return { windowDays, since, ordersCounted, truncated, variants };
}

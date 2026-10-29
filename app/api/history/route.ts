import { listHistory } from "@/lib/db/shop-data";
import { withShopifyAuth } from "@/lib/shopify/auth";
import type { HistoryResponse } from "@/lib/shopify/shared";

/** The shop's most recent recommendation snapshots, newest first. */
export const GET = withShopifyAuth(async (_request, { shop }) => {
  return Response.json({ entries: await listHistory(shop, 20) } satisfies HistoryResponse);
});

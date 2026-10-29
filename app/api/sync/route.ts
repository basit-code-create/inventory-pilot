import { runSync } from "@/lib/automation/sync";
import { withShopifyAuth } from "@/lib/shopify/auth";

/** Sync inventory: fresh stock and sales from Shopify, recommendations from saved rules, logged in history. */
export const POST = withShopifyAuth(async (_request, { graphql, shop }) => {
  const startedAt = Date.now();
  const result = await runSync(shop, graphql);
  console.info(
    `[sync] ${shop}: ${result.snapshot.levels.length} stock levels, sales ${result.sales.status}, ` +
      `${result.history.needsReorder} to reorder, ${Date.now() - startedAt} ms`,
  );
  return Response.json(result);
});

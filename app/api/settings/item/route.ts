import { saveItemRule } from "@/lib/db/shop-data";
import { parseOverride } from "@/lib/inventory/rules";
import { withShopifyAuth } from "@/lib/shopify/auth";
import { LEVEL_ID_PATTERN } from "@/lib/shopify/shared";

/** Saves one variant-location rule. An empty override removes it, so the item follows the defaults. */
export const PUT = withShopifyAuth(async (request, { shop }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const levelId = typeof body?.levelId === "string" ? body.levelId : "";
  const override = parseOverride(body?.override);
  if (!LEVEL_ID_PATTERN.test(levelId) || !override) {
    return Response.json({ error: "invalid_request", message: "The item rule is invalid." }, { status: 400 });
  }

  await saveItemRule(shop, levelId, override);
  return Response.json({ saved: true });
});

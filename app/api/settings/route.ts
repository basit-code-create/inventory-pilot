import { loadShopSettings, resetShopSettings, saveShopDefaults } from "@/lib/db/shop-data";
import { parseReorderOptions } from "@/lib/inventory/reorder";
import { parseDefaultRule } from "@/lib/inventory/rules";
import { withShopifyAuth } from "@/lib/shopify/auth";
import type { SettingsResponse } from "@/lib/shopify/shared";

const badRequest = (message: string) => Response.json({ error: "invalid_request", message }, { status: 400 });

/** The shop's saved reorder rules, or the built-in defaults if none are saved yet. */
export const GET = withShopifyAuth(async (_request, { shop }) => {
  return Response.json((await loadShopSettings(shop)) satisfies SettingsResponse);
});

/** Saves the default rule and the incoming-stock setting. Validated here, not just in the browser. */
export const PUT = withShopifyAuth(async (request, { shop }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const defaults = parseDefaultRule(body?.defaults);
  const options = parseReorderOptions(body?.options);
  if (!defaults || !options) return badRequest("The default rule or options are invalid.");

  await saveShopDefaults(shop, defaults, options);
  return Response.json({ saved: true });
});

/** Resets every rule for the shop back to the built-in defaults. */
export const DELETE = withShopifyAuth(async (_request, { shop }) => {
  await resetShopSettings(shop);
  return Response.json({ reset: true });
});

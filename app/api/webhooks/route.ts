import { parseInventoryUpdate, processInventoryUpdate } from "@/lib/automation/inventory-update";
import { createWebhookHandler } from "@/lib/automation/webhook-handler";
import { getCollections } from "@/lib/db/collections";
import { deleteShopData, getLevelState, loadShopSettings, recordHistory, swapLevelState } from "@/lib/db/shop-data";
import { getTokenStore } from "@/lib/shopify/auth";
import { createBackgroundGraphql } from "@/lib/shopify/background-admin";
import { getShopifyConfig } from "@/lib/shopify/config";
import { ReauthorizationRequiredError } from "@/lib/shopify/offline-token";

const DUPLICATE_KEY = 11000;

export const POST = createWebhookHandler({
  getClientSecret: () => getShopifyConfig().clientSecret,

  ledger: {
    async claim(webhookId, shop, topic) {
      const { deliveries } = await getCollections();
      try {
        await deliveries.insertOne({ _id: webhookId, shop, topic, status: "processing", receivedAt: new Date() });
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
        throw error;
      }
    },
    async complete(webhookId) {
      const { deliveries } = await getCollections();
      await deliveries.updateOne({ _id: webhookId }, { $set: { status: "done" } });
    },
    async release(webhookId) {
      const { deliveries } = await getCollections();
      await deliveries.deleteOne({ _id: webhookId });
    },
  },

  handlers: {
    "inventory_levels/update": async (shop, payload) => {
      const config = getShopifyConfig();
      try {
        const outcome = await processInventoryUpdate(shop, payload, {
          graphql: createBackgroundGraphql(shop, config, getTokenStore(config.clientId)),
          loadSettings: loadShopSettings,
          getLevelState,
          swapLevelState,
          recordHistory,
        });
        const update = parseInventoryUpdate(payload);
        const target = update ? ` (${update.inventoryItemId} at ${update.locationId})` : "";
        console.info(`[webhooks] inventory_levels/update for ${shop}${target}: ${outcome}`);
      } catch (error) {
        // Retrying can't help until a merchant opens the app again; the next sync catches up.
        if (error instanceof ReauthorizationRequiredError) {
          console.warn(`[webhooks] ${error.message}`);
          return;
        }
        throw error;
      }
    },

    "app/uninstalled": async (shop) => {
      // Rules are kept in case the shop reinstalls; shop/redact removes them 48 hours after uninstall.
      await getTokenStore(getShopifyConfig().clientId).delete(shop);
    },

    // Mandatory compliance topics. InventoryPilot stores no customer data, so there is nothing to return or erase.
    "customers/data_request": async () => {},
    "customers/redact": async () => {},
    "shop/redact": async (shop) => {
      await Promise.all([deleteShopData(shop), getTokenStore(getShopifyConfig().clientId).delete(shop)]);
    },
  },
});

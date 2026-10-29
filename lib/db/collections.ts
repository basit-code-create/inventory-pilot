import "server-only";

import type { Collection, Db, ObjectId } from "mongodb";
import type { HistoryEntry } from "../inventory/history";
import type { ReorderOptions } from "../inventory/reorder";
import type { DemandSource } from "../inventory/rules";
import type { ReorderRule, ReorderRuleOverride } from "../inventory/types";
import { getDb } from "./mongodb";

/*
 * InventoryPilot's own data, per shop. Current stock is never stored as the truth: Shopify is
 * the source of truth and is re-read on every sync and every webhook.
 */

export interface ShopSettingsDocument {
  /** The shop's myshopify.com domain. */
  _id: string;
  defaults: ReorderRule;
  options: ReorderOptions;
  updatedAt: Date;
}

export interface ItemRuleDocument {
  /** `${shop}|${levelId}` */
  _id: string;
  shop: string;
  levelId: string;
  override: ReorderRuleOverride;
  updatedAt: Date;
}

export interface HistoryDocument extends Omit<HistoryEntry, "id" | "createdAt"> {
  _id?: ObjectId;
  shop: string;
  createdAt: Date;
}

/** The last recommendation worked out for a stock level, used to spot changes from webhooks. */
export interface LevelStateDocument {
  /** `${shop}|${levelId}` */
  _id: string;
  shop: string;
  levelId: string;
  averageDailyDemand: number;
  demandSource: DemandSource;
  needsReorder: boolean;
  recommendedQuantity: number;
  /** The `updated_at` of the newest webhook applied, to ignore older ones that arrive late. */
  shopifyUpdatedAt: Date | null;
  updatedAt: Date;
}

/** One row per webhook delivery, keyed by X-Shopify-Webhook-Id, so a redelivery is processed once. */
export interface WebhookDeliveryDocument {
  _id: string;
  shop: string;
  topic: string;
  status: "processing" | "done";
  receivedAt: Date;
}

export interface Collections {
  settings: Collection<ShopSettingsDocument>;
  itemRules: Collection<ItemRuleDocument>;
  history: Collection<HistoryDocument>;
  levelStates: Collection<LevelStateDocument>;
  deliveries: Collection<WebhookDeliveryDocument>;
}

const DAY_SECONDS = 86_400;
const HISTORY_RETENTION_DAYS = 180;
// Shopify retries a failed webhook for up to 4 hours, so a week is plenty to catch duplicates.
const DELIVERY_RETENTION_DAYS = 7;

let collections: Promise<Collections> | undefined;

/** Typed collections, with their indexes created once per server process. */
export function getCollections(getDatabase: () => Promise<Db> = getDb): Promise<Collections> {
  collections ??= (async () => {
    const db = await getDatabase();
    const result: Collections = {
      settings: db.collection<ShopSettingsDocument>("shop_settings"),
      itemRules: db.collection<ItemRuleDocument>("item_rules"),
      history: db.collection<HistoryDocument>("recommendation_history"),
      levelStates: db.collection<LevelStateDocument>("level_states"),
      deliveries: db.collection<WebhookDeliveryDocument>("webhook_deliveries"),
    };
    await Promise.all([
      result.itemRules.createIndex({ shop: 1 }),
      result.history.createIndex({ shop: 1, createdAt: -1 }),
      result.history.createIndex({ createdAt: 1 }, { expireAfterSeconds: HISTORY_RETENTION_DAYS * DAY_SECONDS }),
      result.levelStates.createIndex({ shop: 1 }),
      result.deliveries.createIndex({ receivedAt: 1 }, { expireAfterSeconds: DELIVERY_RETENTION_DAYS * DAY_SECONDS }),
    ]);
    return result;
  })().catch((error: unknown) => {
    collections = undefined;
    throw error;
  });
  return collections;
}

export const shopKey = (shop: string, levelId: string) => `${shop}|${levelId}`;

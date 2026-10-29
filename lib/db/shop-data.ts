import "server-only";

import type { DashboardItem } from "../inventory/dashboard";
import { needsReorder } from "../inventory/dashboard";
import type { HistoryEntry } from "../inventory/history";
import { DEFAULT_REORDER_OPTIONS, parseReorderOptions, type ReorderOptions } from "../inventory/reorder";
import { DEFAULT_REORDER_RULE } from "../inventory/rules";
import type { ReorderRule, ReorderRuleOverride, RuleOverrides } from "../inventory/types";
import { getCollections, shopKey, type LevelStateDocument } from "./collections";

export interface ShopSettings {
  defaults: ReorderRule;
  options: ReorderOptions;
  overrides: RuleOverrides;
}

export async function loadShopSettings(shop: string): Promise<ShopSettings> {
  const { settings, itemRules } = await getCollections();
  const [doc, rules] = await Promise.all([settings.findOne({ _id: shop }), itemRules.find({ shop }).toArray()]);
  return {
    defaults: doc?.defaults ?? DEFAULT_REORDER_RULE,
    // Settings saved before a newer option existed get that option's default.
    options: parseReorderOptions(doc?.options) ?? DEFAULT_REORDER_OPTIONS,
    overrides: Object.fromEntries(rules.map((rule) => [rule.levelId, rule.override])),
  };
}

export async function saveShopDefaults(shop: string, defaults: ReorderRule, options: ReorderOptions): Promise<void> {
  const { settings } = await getCollections();
  await settings.replaceOne({ _id: shop }, { defaults, options, updatedAt: new Date() }, { upsert: true });
}

/** An empty override removes the item's rule, so it follows the defaults again. */
export async function saveItemRule(shop: string, levelId: string, override: ReorderRuleOverride): Promise<void> {
  const { itemRules } = await getCollections();
  const _id = shopKey(shop, levelId);
  if (Object.keys(override).length === 0) {
    await itemRules.deleteOne({ _id });
    return;
  }
  await itemRules.replaceOne({ _id }, { shop, levelId, override, updatedAt: new Date() }, { upsert: true });
}

export async function resetShopSettings(shop: string): Promise<void> {
  const { settings, itemRules } = await getCollections();
  await Promise.all([settings.deleteOne({ _id: shop }), itemRules.deleteMany({ shop })]);
}

export async function recordHistory(shop: string, entry: HistoryEntry): Promise<string> {
  const { history } = await getCollections();
  const result = await history.insertOne({
    shop,
    createdAt: new Date(entry.createdAt),
    trigger: entry.trigger,
    incomingStock: entry.incomingStock,
    summary: entry.summary,
    items: entry.items,
    itemsTruncated: entry.itemsTruncated,
  });
  return result.insertedId.toHexString();
}

export async function listHistory(shop: string, limit = 20): Promise<HistoryEntry[]> {
  const { history } = await getCollections();
  const docs = await history.find({ shop }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map((doc) => ({
    id: doc._id?.toHexString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    trigger: doc.trigger,
    incomingStock: doc.incomingStock,
    summary: doc.summary,
    items: doc.items,
    itemsTruncated: doc.itemsTruncated,
  }));
}

export async function getLevelState(shop: string, levelId: string): Promise<LevelStateDocument | null> {
  const { levelStates } = await getCollections();
  return levelStates.findOne({ _id: shopKey(shop, levelId) });
}

/**
 * Remembers each item's latest recommendation. `shopifyUpdatedAt` is only moved forward by
 * webhooks; a full sync clears it, since the sync itself read the newest stock.
 */
export async function saveLevelStates(
  shop: string,
  items: readonly DashboardItem[],
  shopifyUpdatedAt: Date | null = null,
): Promise<void> {
  if (items.length === 0) return;
  const { levelStates } = await getCollections();
  const now = new Date();
  await levelStates.bulkWrite(
    items.map((item) => ({
      replaceOne: {
        filter: { _id: shopKey(shop, item.level.id) },
        replacement: {
          shop,
          levelId: item.level.id,
          averageDailyDemand: item.rule.averageDailyDemand,
          demandSource: item.demandSource,
          needsReorder: needsReorder(item),
          recommendedQuantity: item.reorder?.recommendedQuantity ?? 0,
          shopifyUpdatedAt,
          updatedAt: now,
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

const DUPLICATE_KEY = 11000;

export type LevelStateSwap = { applied: false } | { applied: true; previous: LevelStateDocument | null };

/**
 * Saves a webhook's result and returns the state it replaced, in one atomic step, so two
 * concurrent webhooks for the same item can't both see it as "not needing a reorder yet".
 * Not applied when a newer (or the same) Shopify update was already saved.
 */
export async function swapLevelState(
  shop: string,
  item: DashboardItem,
  shopifyUpdatedAt: Date | null,
): Promise<LevelStateSwap> {
  const { levelStates } = await getCollections();
  const _id = shopKey(shop, item.level.id);
  const filter = shopifyUpdatedAt
    ? { _id, $or: [{ shopifyUpdatedAt: null }, { shopifyUpdatedAt: { $lt: shopifyUpdatedAt } }] }
    : { _id };
  try {
    const previous = await levelStates.findOneAndReplace(
      filter,
      {
        shop,
        levelId: item.level.id,
        averageDailyDemand: item.rule.averageDailyDemand,
        demandSource: item.demandSource,
        needsReorder: needsReorder(item),
        recommendedQuantity: item.reorder?.recommendedQuantity ?? 0,
        shopifyUpdatedAt,
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "before" },
    );
    return { applied: true, previous };
  } catch (error) {
    // The filter missed an existing, newer state, so the upsert collided with its _id.
    if ((error as { code?: number }).code === DUPLICATE_KEY) return { applied: false };
    throw error;
  }
}

/** For Shopify's shop/redact request: removes everything InventoryPilot stores about a shop. */
export async function deleteShopData(shop: string): Promise<void> {
  const { settings, itemRules, history, levelStates, deliveries } = await getCollections();
  await Promise.all([
    settings.deleteOne({ _id: shop }),
    itemRules.deleteMany({ shop }),
    history.deleteMany({ shop }),
    levelStates.deleteMany({ shop }),
    deliveries.deleteMany({ shop }),
  ]);
}

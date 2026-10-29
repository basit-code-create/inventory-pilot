import "server-only";

import type { InventoryLevel } from "../inventory/types";
import { waitForQueryBudget, type GraphqlResult } from "./admin-graphql";
import type { ShopifyAdminContext } from "./auth";
import { MAX_SYNCED_LEVELS } from "./shared";

const LOCATIONS_PAGE_SIZE = 50;
// Keeps each page's requested cost well under Shopify's 1,000-point limit per query.
const LEVELS_PAGE_SIZE = 50;

const LOCATIONS_QUERY = `#graphql
  query InventoryLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
      }
    }
  }
`;

// InventoryItem.variant is deprecated; `variants` is its replacement.
const LEVELS_QUERY = `#graphql
  query LocationInventoryLevels($locationId: ID!, $first: Int!, $after: String) {
    location(id: $locationId) {
      inventoryLevels(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          quantities(names: ["available", "incoming"]) {
            name
            quantity
          }
          item {
            id
            sku
            tracked
            unitCost {
              amount
              currencyCode
            }
            variants(first: 1) {
              nodes {
                id
                title
                product {
                  id
                  title
                  status
                  vendor
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ShopifyLocation {
  id: string;
  name: string;
}

interface LocationsData {
  locations: { pageInfo: PageInfo; nodes: ShopifyLocation[] };
}

export interface LevelNode {
  quantities: { name: string; quantity: number }[];
  item: {
    id: string;
    sku: string | null;
    tracked: boolean;
    /** MoneyV2: amount is a decimal string. Null when no cost per item is set. */
    unitCost: { amount: string; currencyCode: string } | null;
    variants: {
      nodes: {
        id: string;
        title: string;
        product: { id: string; title: string; status: string; vendor: string | null };
      }[];
    };
  };
}

/** A cost of 0 usually means "not entered", so it counts as missing rather than free. */
function parseUnitCost(cost: LevelNode["item"]["unitCost"]): InventoryLevel["unitCost"] {
  const amount = Number(cost?.amount);
  return cost && Number.isFinite(amount) && amount > 0 ? { amount, currencyCode: cost.currencyCode } : null;
}

interface LevelsData {
  location: { inventoryLevels: { pageInfo: PageInfo; nodes: LevelNode[] } } | null;
}

export interface LiveInventory {
  levels: InventoryLevel[];
  locationCount: number;
  /** True when the store has more than MAX_SYNCED_LEVELS stock levels and the rest were skipped. */
  truncated: boolean;
  requestCount: number;
}

interface FetchOptions {
  sleep?: (ms: number) => Promise<void>;
  maxLevels?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Archived products and inventory items without a variant aren't sold, so they're left out. */
export function toInventoryLevel(node: LevelNode, location: ShopifyLocation): InventoryLevel | null {
  const variant = node.item.variants.nodes[0];
  if (!variant || variant.product.status === "ARCHIVED") return null;

  const quantity = (name: string) => node.quantities.find((entry) => entry.name === name)?.quantity ?? 0;
  return {
    id: `${variant.id}@${location.id}`,
    productId: variant.product.id,
    productTitle: variant.product.title,
    vendor: variant.product.vendor?.trim() || null,
    unitCost: parseUnitCost(node.item.unitCost),
    variantId: variant.id,
    variantTitle: variant.title,
    sku: node.item.sku?.trim() || null,
    inventoryItemId: node.item.id,
    tracked: node.item.tracked,
    locationId: location.id,
    locationName: location.name,
    available: quantity("available"),
    incoming: quantity("incoming"),
  };
}

/** Reads every active location and every stock level at it. Read-only: nothing in Shopify changes. */
export async function fetchLiveInventory(
  graphql: ShopifyAdminContext["graphql"],
  { sleep = defaultSleep, maxLevels = MAX_SYNCED_LEVELS }: FetchOptions = {},
): Promise<LiveInventory> {
  let requestCount = 0;

  const locations: ShopifyLocation[] = [];
  let locationsCursor: string | null = null;
  do {
    const page: GraphqlResult<LocationsData> = await graphql<LocationsData>(LOCATIONS_QUERY, {
      first: LOCATIONS_PAGE_SIZE,
      after: locationsCursor,
    });
    requestCount += 1;
    locations.push(...page.data.locations.nodes);
    locationsCursor = page.data.locations.pageInfo.hasNextPage ? page.data.locations.pageInfo.endCursor : null;
    if (locationsCursor) await waitForQueryBudget(page.cost, sleep);
  } while (locationsCursor);

  const levels: InventoryLevel[] = [];
  for (const location of locations) {
    let cursor: string | null = null;
    do {
      const page: GraphqlResult<LevelsData> = await graphql<LevelsData>(LEVELS_QUERY, {
        locationId: location.id,
        first: LEVELS_PAGE_SIZE,
        after: cursor,
      });
      requestCount += 1;
      // The location was deleted while syncing.
      const connection = page.data.location?.inventoryLevels;
      if (!connection) break;

      for (const node of connection.nodes) {
        const level = toInventoryLevel(node, location);
        if (!level) continue;
        if (levels.length >= maxLevels) {
          return { levels, locationCount: locations.length, truncated: true, requestCount };
        }
        levels.push(level);
      }

      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      await waitForQueryBudget(page.cost, sleep);
    } while (cursor);
  }

  return { levels, locationCount: locations.length, truncated: false, requestCount };
}

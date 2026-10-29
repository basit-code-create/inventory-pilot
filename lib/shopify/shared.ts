// Safe to import from the browser, the server and proxy.ts: no secrets and no Node-only APIs.
import type { HistoryEntry } from "../inventory/history";
import type { ReorderOptions } from "../inventory/reorder";
import type { InventorySnapshot, ReorderRule, RuleOverrides, SalesHistory } from "../inventory/types";

/** One sync stops after this many stock levels; very large stores would need Bulk Operations. */
export const MAX_SYNCED_LEVELS = 20_000;

/** Sent with a 401 so App Bridge fetches a fresh session token and retries the request once. */
export const RETRY_INVALID_SESSION_HEADER = "X-Shopify-Retry-Invalid-Session-Request";

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Returns the lower-cased shop domain, or null unless it is exactly `<name>.myshopify.com`. */
export function normalizeShopDomain(value: string | null | undefined): string | null {
  const domain = value?.trim().toLowerCase() ?? "";
  return SHOP_DOMAIN_PATTERN.test(domain) ? domain : null;
}

/** Orders are protected customer data and need separate approval from Shopify. */
export interface OrdersAccess {
  status: "granted" | "not_approved" | "unknown";
  /** Shopify's own error message when the check failed. */
  message: string | null;
}

/** Sales history as part of a sync. Not approved is a normal answer; stock still loads either way. */
export type SalesHistoryResponse =
  | ({ status: "ok" } & SalesHistory)
  | { status: "not_approved"; message: string }
  | { status: "error"; message: string };

/** Response body of POST /api/sync. */
export interface SyncResponse {
  snapshot: InventorySnapshot;
  sales: SalesHistoryResponse;
  history: { id: string; needsReorder: number; recommendedUnits: number };
}

/** Response body of GET /api/settings. */
export interface SettingsResponse {
  defaults: ReorderRule;
  options: ReorderOptions;
  overrides: RuleOverrides;
}

/** Response body of GET /api/history. */
export interface HistoryResponse {
  entries: HistoryEntry[];
}

/** Item rules are saved for live stock levels only: `${variantGid}@${locationGid}`. */
export const LEVEL_ID_PATTERN = /^gid:\/\/shopify\/ProductVariant\/\d+@gid:\/\/shopify\/Location\/\d+$/;

/** Response body of GET /api/shopify/status. */
export type ShopifyStatusResponse =
  | {
      connected: true;
      shop: { name: string; domain: string };
      grantedScopes: string[];
      missingScopes: string[];
      /** More access than the app needs, e.g. write scopes for a recommendation-only app. */
      extraScopes: string[];
      ordersAccess: OrdersAccess;
      apiVersion: { requested: string; served: string | null };
      webhooks: WebhookStatus;
    }
  | { connected: false; error: string; message: string };

/** Whether Shopify is set up to send stock-change webhooks to this app's current URL. */
export type WebhookStatus =
  | { status: "ok" }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

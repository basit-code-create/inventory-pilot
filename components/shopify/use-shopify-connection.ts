"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, isEmbeddedInShopifyAdmin } from "@/lib/shopify/app-bridge-client";
import type { OrdersAccess, ShopifyStatusResponse, WebhookStatus } from "@/lib/shopify/shared";

export type ShopifyConnection =
  | { status: "checking" }
  | { status: "not_embedded" }
  | {
      status: "connected";
      shopName: string;
      shopDomain: string;
      missingScopes: string[];
      extraScopes: string[];
      ordersAccess: OrdersAccess;
      webhooks: WebhookStatus;
      apiVersion: { requested: string; served: string | null };
    }
  | { status: "error"; message: string };

// Whether the page is embedded never changes after load, so there is nothing to subscribe to.
const subscribe = () => () => {};

// The status check also repairs webhook subscriptions, so the second run of a Strict Mode effect
// shares the request in flight instead of starting another.
let checkInFlight: Promise<ShopifyConnection> | null = null;

function checkConnection(): Promise<ShopifyConnection> {
  checkInFlight ??= requestConnectionStatus().finally(() => {
    checkInFlight = null;
  });
  return checkInFlight;
}

async function requestConnectionStatus(): Promise<ShopifyConnection> {
  try {
    const response = await authenticatedFetch("/api/shopify/status");
    const body = (await response.json().catch(() => null)) as ShopifyStatusResponse | null;
    if (!body) return { status: "error", message: `The status check failed (HTTP ${response.status}).` };
    if (!body.connected) return { status: "error", message: body.message };
    return {
      status: "connected",
      shopName: body.shop.name,
      shopDomain: body.shop.domain,
      missingScopes: body.missingScopes,
      extraScopes: body.extraScopes,
      ordersAccess: body.ordersAccess,
      webhooks: body.webhooks,
      apiVersion: body.apiVersion,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The status check failed." };
  }
}

/**
 * "connected" only after the server has made a successful live Admin API request with the
 * shop's token. Outside the Shopify admin there is no session token, so it's "not_embedded".
 */
export function useShopifyConnection() {
  // null while rendering on the server, where it can't be known yet.
  const embedded = useSyncExternalStore(subscribe, isEmbeddedInShopifyAdmin, () => null);
  const [result, setResult] = useState<ShopifyConnection>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!embedded) return;
    let ignore = false;
    checkConnection().then((next) => {
      if (!ignore) setResult(next);
    });
    return () => {
      ignore = true;
    };
  }, [embedded, attempt]);

  const connection: ShopifyConnection =
    embedded === null ? { status: "checking" } : embedded ? result : { status: "not_embedded" };

  function recheck() {
    setResult({ status: "checking" });
    setAttempt((count) => count + 1);
  }

  return { connection, recheck };
}

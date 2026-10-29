import "server-only";

import { normalizeShopDomain } from "../shopify/shared";
import { verifyWebhookHmac } from "../shopify/webhooks";

/** Records each delivery once, so a redelivered webhook is acknowledged without running again. */
export interface DeliveryLedger {
  /** False if this delivery was already claimed. */
  claim(webhookId: string, shop: string, topic: string): Promise<boolean>;
  complete(webhookId: string): Promise<void>;
  /** Forgets a failed delivery so Shopify's retry is processed. */
  release(webhookId: string): Promise<void>;
}

export type WebhookTopicHandler = (shop: string, payload: unknown) => Promise<unknown>;

export interface WebhookHandlerDeps {
  getClientSecret: () => string;
  ledger: DeliveryLedger;
  /** Keyed by the X-Shopify-Topic value, e.g. "inventory_levels/update". */
  handlers: Record<string, WebhookTopicHandler>;
}

const text = (body: string, status: number) => new Response(body, { status });

/**
 * POST handler for Shopify webhooks:
 * 1. verify the HMAC over the raw body before trusting anything in the request,
 * 2. skip deliveries already seen (X-Shopify-Webhook-Id),
 * 3. process, then answer 200, or 500 so Shopify retries.
 */
export function createWebhookHandler(deps: WebhookHandlerDeps) {
  return async function handleWebhook(request: Request): Promise<Response> {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (!verifyWebhookHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), deps.getClientSecret())) {
      return text("Invalid HMAC", 401);
    }

    const topic = request.headers.get("x-shopify-topic");
    const shop = normalizeShopDomain(request.headers.get("x-shopify-shop-domain"));
    const webhookId = request.headers.get("x-shopify-webhook-id");
    if (!topic || !shop || !webhookId) return text("Missing webhook headers", 400);

    const handler = deps.handlers[topic];
    if (!handler) return text("Topic not handled", 200);

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return text("Body isn't JSON", 400);
    }

    if (!(await deps.ledger.claim(webhookId, shop, topic))) return text("Already processed", 200);

    try {
      await handler(shop, payload);
      await deps.ledger.complete(webhookId);
      return text("OK", 200);
    } catch (error) {
      await deps.ledger.release(webhookId);
      console.error(`[webhooks] ${topic} for ${shop} failed: ${error instanceof Error ? error.message : String(error)}`);
      return text("Processing failed", 500);
    }
  };
}

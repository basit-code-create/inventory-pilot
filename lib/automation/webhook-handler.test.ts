import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TEST_CONFIG, TEST_SHOP } from "../../test/shopify-fixtures";
import { createWebhookHandler, type DeliveryLedger } from "./webhook-handler";

function memoryLedger(): DeliveryLedger & { seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return {
    seen,
    async claim(id) {
      if (seen.has(id)) return false;
      seen.set(id, "processing");
      return true;
    },
    async complete(id) {
      seen.set(id, "done");
    },
    async release(id) {
      seen.delete(id);
    },
  };
}

const body = JSON.stringify({ inventory_item_id: 1, location_id: 2, available: 3 });
const sign = (raw: string, secret = TEST_CONFIG.clientSecret) =>
  createHmac("sha256", secret).update(raw).digest("base64");

function webhookRequest({
  raw = body,
  signature = sign(body),
  topic = "inventory_levels/update",
  webhookId = "delivery-1",
  shop = TEST_SHOP,
}: { raw?: string; signature?: string | null; topic?: string; webhookId?: string; shop?: string } = {}) {
  const headers: Record<string, string> = {
    "X-Shopify-Topic": topic,
    "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": webhookId,
  };
  if (signature) headers["X-Shopify-Hmac-SHA256"] = signature;
  return new Request("https://app.example.com/api/webhooks", { method: "POST", headers, body: raw });
}

function setup(handler = vi.fn(async () => {})) {
  const ledger = memoryLedger();
  const route = createWebhookHandler({
    getClientSecret: () => TEST_CONFIG.clientSecret,
    ledger,
    handlers: { "inventory_levels/update": handler },
  });
  return { route, handler, ledger };
}

describe("webhook handler", () => {
  it("processes a correctly signed delivery", async () => {
    const { route, handler } = setup();
    const response = await route(webhookRequest());
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(TEST_SHOP, JSON.parse(body));
  });

  it("rejects a missing, forged or tampered signature without processing", async () => {
    const { route, handler } = setup();
    expect((await route(webhookRequest({ signature: null }))).status).toBe(401);
    expect((await route(webhookRequest({ signature: sign(body, "not-the-secret") }))).status).toBe(401);
    expect((await route(webhookRequest({ raw: body.replace("3", "300") }))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("acknowledges a redelivery without processing it twice", async () => {
    const { route, handler } = setup();
    await route(webhookRequest());
    const again = await route(webhookRequest());
    expect(again.status).toBe(200);
    expect(await again.text()).toBe("Already processed");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("answers 500 on failure and processes Shopify's retry", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("Shopify timed out")).mockResolvedValueOnce(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { route, ledger } = setup(handler);

    expect((await route(webhookRequest())).status).toBe(500);
    expect(ledger.seen.has("delivery-1")).toBe(false);
    expect((await route(webhookRequest())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("acknowledges topics it doesn't handle", async () => {
    const { route, handler } = setup();
    expect((await route(webhookRequest({ topic: "products/update" }))).status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects deliveries without the expected headers or with a bad shop domain", async () => {
    const { route } = setup();
    expect((await route(webhookRequest({ shop: "evil.example.com" }))).status).toBe(400);
    expect((await route(webhookRequest({ webhookId: "" }))).status).toBe(400);
  });
});

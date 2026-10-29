import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planWebhookSubscriptions, verifyWebhookHmac, webhookUri } from "./webhooks";

const SECRET = "test-client-secret-0123456789abcdef0123456789";
const raw = new TextEncoder().encode('{"inventory_item_id":1}');
const signature = createHmac("sha256", SECRET).update(raw).digest("base64");

describe("verifyWebhookHmac", () => {
  it("accepts Shopify's signature of the raw body", () => {
    expect(verifyWebhookHmac(raw, signature, SECRET)).toBe(true);
  });

  it("rejects a missing, wrong-length or wrong signature", () => {
    expect(verifyWebhookHmac(raw, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(raw, "c2hvcnQ=", SECRET)).toBe(false);
    expect(verifyWebhookHmac(raw, signature, "another-secret")).toBe(false);
  });
});

describe("planWebhookSubscriptions", () => {
  const uri = webhookUri("https://new-tunnel.trycloudflare.com");

  it("creates the subscriptions that are missing", () => {
    expect(planWebhookSubscriptions([], uri)).toEqual({
      create: ["INVENTORY_LEVELS_UPDATE", "APP_UNINSTALLED"],
      update: [],
      remove: [],
    });
  });

  it("moves subscriptions left pointing at an old tunnel URL", () => {
    const existing = [
      { id: "sub-1", topic: "INVENTORY_LEVELS_UPDATE", uri: "https://old-tunnel.trycloudflare.com/api/webhooks" },
      { id: "sub-2", topic: "APP_UNINSTALLED", uri },
    ];
    expect(planWebhookSubscriptions(existing, uri)).toEqual({
      create: [],
      update: [{ id: "sub-1", topic: "INVENTORY_LEVELS_UPDATE" }],
      remove: [],
    });
  });

  it("does nothing when every topic already points here", () => {
    const existing = [
      { id: "sub-1", topic: "INVENTORY_LEVELS_UPDATE", uri },
      { id: "sub-2", topic: "APP_UNINSTALLED", uri },
    ];
    expect(planWebhookSubscriptions(existing, uri)).toEqual({ create: [], update: [], remove: [] });
  });
});

describe("planWebhookSubscriptions with duplicates", () => {
  it("keeps one subscription per topic and removes the rest", () => {
    const uri = webhookUri("https://tunnel.trycloudflare.com");
    const existing = [
      { id: "sub-1", topic: "INVENTORY_LEVELS_UPDATE", uri: "https://old.trycloudflare.com/api/webhooks" },
      { id: "sub-2", topic: "INVENTORY_LEVELS_UPDATE", uri },
      { id: "sub-3", topic: "INVENTORY_LEVELS_UPDATE", uri },
      { id: "sub-4", topic: "APP_UNINSTALLED", uri },
    ];
    expect(planWebhookSubscriptions(existing, uri)).toEqual({ create: [], update: [], remove: ["sub-1", "sub-3"] });
  });
});

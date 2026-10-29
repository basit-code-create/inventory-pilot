import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShopifyAdminContext } from "./auth";

/**
 * Shopify signs each delivery with HMAC-SHA256 of the raw body, keyed by the client secret, and
 * sends it base64-encoded in X-Shopify-Hmac-SHA256. Compared in constant time.
 */
export function verifyWebhookHmac(rawBody: Uint8Array, signature: string | null, clientSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", clientSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

/** Topics this app subscribes to through the Admin API (compliance topics are set in the app config). */
export const SUBSCRIBED_TOPICS = ["INVENTORY_LEVELS_UPDATE", "APP_UNINSTALLED"] as const;

export function webhookUri(appUrl: string): string {
  return `${appUrl}/api/webhooks`;
}

interface ExistingSubscription {
  id: string;
  topic: string;
  uri: string;
}

export interface SubscriptionPlan {
  create: string[];
  update: { id: string; topic: string }[];
  /** Extra subscriptions for a topic, which would deliver every event more than once. */
  remove: string[];
}

/**
 * What to change so each topic delivers to `uri` exactly once. A dev tunnel gets a new URL when it
 * restarts, so a subscription pointing at an old URL is moved instead of duplicated, and any
 * duplicates are removed.
 */
export function planWebhookSubscriptions(existing: readonly ExistingSubscription[], uri: string): SubscriptionPlan {
  const plan: SubscriptionPlan = { create: [], update: [], remove: [] };
  for (const topic of SUBSCRIBED_TOPICS) {
    const forTopic = existing.filter((subscription) => subscription.topic === topic);
    const keep = forTopic.find((subscription) => subscription.uri === uri) ?? forTopic[0];
    if (!keep) {
      plan.create.push(topic);
      continue;
    }
    if (keep.uri !== uri) plan.update.push({ id: keep.id, topic });
    plan.remove.push(...forTopic.filter((subscription) => subscription !== keep).map((subscription) => subscription.id));
  }
  return plan;
}

const SUBSCRIPTIONS_QUERY = `#graphql
  query AppWebhookSubscriptions($topics: [WebhookSubscriptionTopic!]) {
    webhookSubscriptions(first: 50, topics: $topics) {
      nodes {
        id
        topic
        uri
      }
    }
  }
`;

const CREATE_MUTATION = `#graphql
  mutation CreateWebhookSubscription($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri }) {
      userErrors {
        message
      }
    }
  }
`;

const UPDATE_MUTATION = `#graphql
  mutation UpdateWebhookSubscription($id: ID!, $uri: String!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: { uri: $uri }) {
      userErrors {
        message
      }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation DeleteWebhookSubscription($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      userErrors {
        message
      }
    }
  }
`;

type UserErrorsData = Record<string, { userErrors: { message: string }[] }>;

function throwOnUserErrors(data: UserErrorsData) {
  const messages = Object.values(data).flatMap((result) => result.userErrors.map((error) => error.message));
  if (messages.length > 0) throw new Error(`Webhook subscription failed: ${messages.join(" ")}`);
}

// Two checks for one shop at once would both see "missing" and both create a subscription.
const inFlight = new Map<string, Promise<SubscriptionPlan>>();

/** Makes sure Shopify sends inventory and uninstall webhooks to this app's current URL, once each. */
export function ensureWebhookSubscriptions(
  shop: string,
  graphql: ShopifyAdminContext["graphql"],
  appUrl: string,
): Promise<SubscriptionPlan> {
  const existing = inFlight.get(shop);
  if (existing) return existing;
  const promise = reconcileSubscriptions(graphql, appUrl).finally(() => inFlight.delete(shop));
  inFlight.set(shop, promise);
  return promise;
}

async function reconcileSubscriptions(graphql: ShopifyAdminContext["graphql"], appUrl: string): Promise<SubscriptionPlan> {
  const uri = webhookUri(appUrl);
  const { data } = await graphql<{ webhookSubscriptions: { nodes: ExistingSubscription[] } }>(SUBSCRIPTIONS_QUERY, {
    topics: SUBSCRIBED_TOPICS,
  });
  const plan = planWebhookSubscriptions(data.webhookSubscriptions.nodes, uri);

  for (const topic of plan.create) {
    throwOnUserErrors((await graphql<UserErrorsData>(CREATE_MUTATION, { topic, uri })).data);
  }
  for (const { id } of plan.update) {
    throwOnUserErrors((await graphql<UserErrorsData>(UPDATE_MUTATION, { id, uri })).data);
  }
  for (const id of plan.remove) {
    throwOnUserErrors((await graphql<UserErrorsData>(DELETE_MUTATION, { id })).data);
  }
  return plan;
}

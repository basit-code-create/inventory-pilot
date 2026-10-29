import type { ReactNode } from "react";
import { REQUIRED_SCOPES } from "@/lib/shopify/scopes";
import { Button } from "@/components/ui/button";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";
import type { ShopifyConnection } from "./use-shopify-connection";

const BADGE_CLASS = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium";

export function ConnectionBadge({ connection }: { connection: ShopifyConnection }) {
  switch (connection.status) {
    case "connected":
      return (
        <span className={`${BADGE_CLASS} bg-success-bg text-success-fg`} title={connection.shopDomain}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          Connected to {connection.shopName}
        </span>
      );
    case "error":
      return (
        <span className={`${BADGE_CLASS} bg-critical-bg text-critical-fg`}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          Shopify connection failed
        </span>
      );
    case "checking":
      return (
        <span className={`${BADGE_CLASS} bg-surface-selected text-muted`} role="status">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
          Checking Shopify connection…
        </span>
      );
    case "not_embedded":
      return (
        <span className={`${BADGE_CLASS} bg-surface-selected text-muted`}>
          <span aria-hidden="true" className="size-1.5 rounded-full border border-current" />
          Shopify not connected
        </span>
      );
  }
}

function Notice({ tone, title, children }: { tone: "critical" | "warning"; title: string; children: ReactNode }) {
  const toneClass = tone === "critical" ? "bg-critical-bg/60 text-critical-fg" : "bg-warning-bg/50 text-warning-fg";
  return (
    <section
      role={tone === "critical" ? "alert" : undefined}
      className={`flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between ${toneClass}`}
    >
      <div className="flex gap-3">
        <AlertIcon width={20} height={20} className="mt-px shrink-0" />
        <div className="text-sm">
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-0.5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Only shown when something about the connection needs attention. */
export function ConnectionNotice({ connection, onRetry }: { connection: ShopifyConnection; onRetry: () => void }) {
  if (connection.status === "error") {
    return (
      <Notice tone="critical" title="Couldn't connect to Shopify">
        <p>{connection.message}</p>
        <Button className="mt-3" onClick={onRetry}>
          <RefreshIcon />
          Try again
        </Button>
      </Notice>
    );
  }

  if (connection.status !== "connected") return null;

  const { missingScopes, extraScopes, ordersAccess, apiVersion, webhooks } = connection;
  const problems: string[] = [];

  if (missingScopes.length > 0) {
    problems.push(
      `The app hasn't been granted ${missingScopes.join(", ")}. Add it to your app version in the Dev Dashboard, release it, then reopen the app from your Shopify admin and approve the update.`,
    );
  }
  if (extraScopes.length > 0) {
    problems.push(
      `The app has more access than it needs: ${extraScopes.join(", ")}. In the Dev Dashboard, set the app version's scopes to ${REQUIRED_SCOPES.join(",")} and release it. The extra access is removed the next time the app is opened.`,
    );
  }
  // A missing read_orders scope also blocks orders; that message above already covers it.
  if (ordersAccess.status === "not_approved" && !missingScopes.includes("read_orders")) {
    problems.push(
      `Shopify hasn't approved access to orders, which are protected customer data. Request Level 1 protected customer data access for the app. Until then, demand can't be calculated from orders. Shopify says: “${ordersAccess.message}”`,
    );
  }
  if (apiVersion.served !== null && apiVersion.served !== apiVersion.requested) {
    problems.push(
      `Shopify served API version ${apiVersion.served} instead of ${apiVersion.requested}. Set SHOPIFY_API_VERSION to a supported version.`,
    );
  }

  if (webhooks.status !== "ok") {
    problems.push(
      `Automatic stock-change updates are off: ${webhooks.message} Recommendations still update when you press Sync inventory.`,
    );
  }

  if (problems.length === 0) return null;

  return (
    <Notice tone="warning" title="The Shopify connection needs attention">
      <ul className="list-disc space-y-1.5 pl-4">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </Notice>
  );
}

import type { ReactNode } from "react";
import { REQUIRED_SCOPES } from "@/lib/shopify/scopes";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import type { ShopifyConnection } from "./use-shopify-connection";

/** Things about a working connection that a merchant should fix. Empty when all is well. */
export function connectionProblems(connection: ShopifyConnection): string[] {
  if (connection.status !== "connected") return [];
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
  // A missing read_orders scope also blocks orders; the message above already covers it.
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
  return problems;
}

/** Shown on every tab: without a connection, nothing else works. */
export function ConnectionErrorBanner({ connection, onRetry }: { connection: ShopifyConnection; onRetry: () => void }) {
  if (connection.status !== "error") return null;
  return (
    <Banner
      tone="critical"
      title="Couldn't connect to Shopify"
      actions={
        <Button onClick={onRetry}>
          <RefreshIcon />
          Try again
        </Button>
      }
    >
      {connection.message}
    </Banner>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs text-muted sm:text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** The full connection report, for the Settings tab. */
export function ConnectionDetails({ connection }: { connection: ShopifyConnection }) {
  if (connection.status === "not_embedded") {
    return (
      <p className="text-sm text-muted">
        Not connected. Open InventoryPilot from your Shopify admin to connect a store.
      </p>
    );
  }
  if (connection.status !== "connected") {
    return <p className="text-sm text-muted">{connection.status === "checking" ? "Checking the connection…" : connection.message}</p>;
  }

  const problems = connectionProblems(connection);
  const ordersAccess = {
    granted: "Approved",
    not_approved: "Not approved",
    unknown: "Couldn't check",
  }[connection.ordersAccess.status];

  return (
    <div className="space-y-4">
      <dl className="divide-y divide-border">
        <DetailRow label="Store">
          {connection.shopName} <span className="text-muted">({connection.shopDomain})</span>
        </DetailRow>
        <DetailRow label="Access">{connection.missingScopes.length === 0 ? "Read-only, all required scopes granted" : "Missing scopes"}</DetailRow>
        <DetailRow label="Orders (for demand)">{ordersAccess}</DetailRow>
        <DetailRow label="Stock-change updates">{connection.webhooks.status === "ok" ? "On" : "Off"}</DetailRow>
        <DetailRow label="API version">{connection.apiVersion.served ?? connection.apiVersion.requested}</DetailRow>
      </dl>
      {problems.length > 0 && (
        <Banner tone="warning" title="Needs attention">
          <ul className="list-disc space-y-1.5 pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}

import "server-only";

export interface ShopifyConfig {
  clientId: string;
  clientSecret: string;
  apiVersion: string;
  /** This app's public HTTPS origin (SHOPIFY_APP_URL), where Shopify sends webhooks. Null if unset or invalid. */
  appUrl: string | null;
}

/** Messages name the variable that's wrong but never include its value. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

const API_VERSION_PATTERN = /^(\d{4}-(01|04|07|10)|unstable)$/;

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function getShopifyConfig(env: Env = process.env): ShopifyConfig {
  const clientId = read(env, "SHOPIFY_CLIENT_ID");
  const clientSecret = read(env, "SHOPIFY_CLIENT_SECRET");
  const apiVersion = read(env, "SHOPIFY_API_VERSION");

  const missing = [
    ["SHOPIFY_CLIENT_ID", clientId],
    ["SHOPIFY_CLIENT_SECRET", clientSecret],
    ["SHOPIFY_API_VERSION", apiVersion],
  ].flatMap(([name, value]) => (value ? [] : [name]));
  if (!clientId || !clientSecret || !apiVersion) {
    throw new ConfigError(`Missing environment variables: ${missing.join(", ")}.`);
  }
  if (!API_VERSION_PATTERN.test(apiVersion)) {
    throw new ConfigError("SHOPIFY_API_VERSION must be a Shopify API version such as 2026-10.");
  }

  return { clientId, clientSecret, apiVersion, appUrl: httpsOrigin(read(env, "SHOPIFY_APP_URL")) };
}

function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export type ConfigCheck = "set" | "missing" | "invalid";

/** For the development health check: says whether each variable looks right, without revealing values. */
export function checkEnvironment(env: Env = process.env): Record<string, ConfigCheck> {
  const appUrl = read(env, "SHOPIFY_APP_URL");
  const apiVersion = read(env, "SHOPIFY_API_VERSION");
  let appUrlCheck: ConfigCheck = "missing";
  if (appUrl) {
    try {
      appUrlCheck = new URL(appUrl).protocol === "https:" ? "set" : "invalid";
    } catch {
      appUrlCheck = "invalid";
    }
  }

  return {
    SHOPIFY_CLIENT_ID: read(env, "SHOPIFY_CLIENT_ID") ? "set" : "missing",
    SHOPIFY_CLIENT_SECRET: read(env, "SHOPIFY_CLIENT_SECRET") ? "set" : "missing",
    SHOPIFY_API_VERSION: !apiVersion ? "missing" : API_VERSION_PATTERN.test(apiVersion) ? "set" : "invalid",
    SHOPIFY_APP_URL: appUrlCheck,
    MONGODB_URI: read(env, "MONGODB_URI") ? "set" : "missing",
  };
}

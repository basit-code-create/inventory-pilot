// Browser-only: talks to this app's authenticated API from inside the Shopify admin.
import { authenticatedFetch } from "../shopify/app-bridge-client";
import type { HistoryResponse, SettingsResponse, SyncResponse } from "../shopify/shared";
import type { ReorderOptions } from "./reorder";
import type { ReorderRule, ReorderRuleOverride } from "./types";

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(input, init);
  const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok || body === null) {
    throw new Error(body?.message ?? `The request failed (HTTP ${response.status}).`);
  }
  return body;
}

const jsonBody = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

async function requestSync(): Promise<SyncResponse> {
  const result = await requestJson<SyncResponse>("/api/sync", { method: "POST" });
  if (result.snapshot?.source !== "live" || !Array.isArray(result.snapshot.levels)) {
    throw new Error("Shopify sync returned an unexpected response.");
  }
  return result;
}

// React runs effects twice in development (Strict Mode). A sync records history, so a call made
// while one is running shares it rather than syncing, and recording, twice.
let syncInFlight: Promise<SyncResponse> | null = null;

/** Fresh stock and sales from Shopify, with recommendations recorded in the history. */
export function syncLiveData(): Promise<SyncResponse> {
  syncInFlight ??= requestSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export const loadSettings = () => requestJson<SettingsResponse>("/api/settings");

export const saveDefaults = (defaults: ReorderRule, options: ReorderOptions) =>
  requestJson<{ saved: true }>("/api/settings", jsonBody("PUT", { defaults, options }));

export const saveItemRule = (levelId: string, override: ReorderRuleOverride) =>
  requestJson<{ saved: true }>("/api/settings/item", jsonBody("PUT", { levelId, override }));

export const resetSettings = () => requestJson<{ reset: true }>("/api/settings", { method: "DELETE" });

export const loadHistory = () => requestJson<HistoryResponse>("/api/history");

import { SignJWT } from "jose";
import { vi } from "vitest";

export const TEST_CONFIG = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret-0123456789abcdef0123456789",
  apiVersion: "2026-10",
  appUrl: "https://app.example.com" as string | null,
};

export const TEST_SHOP = "demo-shop.myshopify.com";

/** Signs a session token the way Shopify does; `claims` overrides or (with undefined) removes defaults. */
export async function signSessionToken(
  claims: Record<string, unknown> = {},
  { secret = TEST_CONFIG.clientSecret, alg = "HS256" }: { secret?: string; alg?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: `https://${TEST_SHOP}/admin`,
    dest: `https://${TEST_SHOP}`,
    aud: TEST_CONFIG.clientId,
    sub: "42",
    sid: "session-1",
    jti: "f8912129-1af6-4cad-9ca3-76b0f7621087",
    iat: now - 5,
    nbf: now - 5,
    exp: now + 55,
    ...claims,
  })
    .setProtectedHeader({ alg, typ: "JWT" })
    .sign(new TextEncoder().encode(secret));
}

export function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: "shpat_new",
    scope: "read_products,read_inventory,read_locations,read_orders",
    expires_in: 3600,
    refresh_token: "shprt_new",
    refresh_token_expires_in: 7_776_000,
    ...overrides,
  });
}

type Responder = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** A fetch mock that records calls and answers each from the next responder in the queue. */
export function queueFetch(...responders: (Response | Responder)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const next = responders.shift();
    if (!next) throw new Error(`Unexpected fetch to ${url}`);
    return typeof next === "function" ? next(url, init) : next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

export function formBody(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(String(init?.body)));
}

export const noSleep = async () => {};

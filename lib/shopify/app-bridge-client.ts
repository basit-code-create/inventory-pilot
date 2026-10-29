// Browser-only helpers around the App Bridge `shopify` global.
import { RETRY_INVALID_SESSION_HEADER } from "./shared";

const ID_TOKEN_TIMEOUT_MS = 10_000;

/** True when running inside the Shopify admin iframe with App Bridge loaded. */
export function isEmbeddedInShopifyAdmin(): boolean {
  if (typeof window === "undefined" || window.top === window.self) return false;
  return typeof shopify !== "undefined" && typeof shopify.idToken === "function";
}

/** Shopify's own toast message inside the admin; does nothing outside it. */
export function showToast(message: string, options: { isError?: boolean } = {}): void {
  if (isEmbeddedInShopifyAdmin()) shopify.toast.show(message, { isError: options.isError });
}

/** A fresh session token per request: they live about a minute, so they're never cached here. */
async function getSessionToken(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("App Bridge didn't return a session token. Reload the app from your Shopify admin.")),
      ID_TOKEN_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([shopify.idToken(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch() to this app's own API with `Authorization: Bearer <session token>`. If the server
 * rejects the token and asks for a retry, it tries once more with a new token.
 */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = async () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await getSessionToken()}`);
    return fetch(input, { ...init, headers });
  };

  const response = await send();
  if (response.status === 401 && response.headers.get(RETRY_INVALID_SESSION_HEADER) === "1") return send();
  return response;
}

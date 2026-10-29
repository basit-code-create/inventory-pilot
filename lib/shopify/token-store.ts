import type { OfflineToken } from "./token-exchange";

export interface StoredOfflineToken extends OfflineToken {
  shop: string;
  updatedAt: number;
}

/** Server-side storage for one offline token per shop. Tokens must never reach the browser. */
export interface TokenStore {
  get(shop: string): Promise<StoredOfflineToken | null>;
  save(token: StoredOfflineToken): Promise<void>;
  delete(shop: string): Promise<void>;
}

export function createMemoryTokenStore(): TokenStore {
  const tokens = new Map<string, StoredOfflineToken>();
  return {
    async get(shop) {
      const token = tokens.get(shop);
      return token ? { ...token } : null;
    },
    async save(token) {
      tokens.set(token.shop, { ...token });
    },
    async delete(shop) {
      tokens.delete(shop);
    },
  };
}

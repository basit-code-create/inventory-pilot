import "server-only";

import type { Db } from "mongodb";
import { getDb } from "../db/mongodb";
import type { StoredOfflineToken, TokenStore } from "./token-store";

const COLLECTION = "shopify_offline_tokens";

interface TokenDocument {
  /**
   * `${clientId}:${shop}`: one offline token per app per shop, so two apps (say a dev and a
   * production app) can share this database without using each other's tokens.
   */
  _id: string;
  clientId: string;
  shop: string;
  accessToken: string;
  scope: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  updatedAt: Date;
}

export interface TokenSummary {
  clientId: string | null;
  shop: string;
  scope: string;
  expiresAt: Date | null;
  hasRefreshToken: boolean;
  refreshTokenExpiresAt: Date | null;
  updatedAt: Date;
}

/** For the development health check: token metadata only, never the tokens themselves. */
export async function listTokenSummaries(getDatabase: () => Promise<Db> = getDb): Promise<TokenSummary[]> {
  const collection = (await getDatabase()).collection<TokenDocument>(COLLECTION);
  return collection
    .aggregate<TokenSummary>([
      {
        $project: {
          _id: 0,
          clientId: { $ifNull: ["$clientId", null] },
          // Documents saved before tokens were keyed by app used the shop as their _id.
          shop: { $ifNull: ["$shop", "$_id"] },
          scope: 1,
          expiresAt: 1,
          hasRefreshToken: { $ne: [{ $ifNull: ["$refreshToken", null] }, null] },
          refreshTokenExpiresAt: 1,
          updatedAt: 1,
        },
      },
    ])
    .toArray();
}

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const toMs = (date: Date | null) => (date === null ? null : date.getTime());

export function createMongoTokenStore(clientId: string, getDatabase: () => Promise<Db> = getDb): TokenStore {
  const collection = async () => (await getDatabase()).collection<TokenDocument>(COLLECTION);
  const idFor = (shop: string) => `${clientId}:${shop}`;

  return {
    async get(shop) {
      const doc = await (await collection()).findOne({ _id: idFor(shop) });
      if (!doc) return null;
      return {
        shop: doc.shop,
        accessToken: doc.accessToken,
        scope: doc.scope,
        expiresAt: toMs(doc.expiresAt),
        refreshToken: doc.refreshToken,
        refreshTokenExpiresAt: toMs(doc.refreshTokenExpiresAt),
        updatedAt: doc.updatedAt.getTime(),
      } satisfies StoredOfflineToken;
    },
    async save(token) {
      const tokens = await collection();
      await tokens.replaceOne(
        { _id: idFor(token.shop) },
        {
          clientId,
          shop: token.shop,
          accessToken: token.accessToken,
          scope: token.scope,
          expiresAt: toDate(token.expiresAt),
          refreshToken: token.refreshToken,
          refreshTokenExpiresAt: toDate(token.refreshTokenExpiresAt),
          updatedAt: new Date(token.updatedAt),
        },
        { upsert: true },
      );
      // Remove the shop's token from before tokens were keyed by app, so no stale credential is left behind.
      await tokens.deleteOne({ _id: token.shop, clientId: { $exists: false } });
    },
    async delete(shop) {
      await (await collection()).deleteOne({ _id: idFor(shop) });
    },
  };
}

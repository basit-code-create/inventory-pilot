import "server-only";

import { MongoClient, type Db } from "mongodb";
import { ConfigError } from "../shopify/config";

const DEFAULT_DB_NAME = "inventorypilot";

// Reuse one client across hot reloads in development and across requests in production.
const globalForMongo = globalThis as typeof globalThis & { inventoryPilotMongo?: Promise<MongoClient> };

function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return Promise.reject(new ConfigError("Missing environment variable: MONGODB_URI."));

  globalForMongo.inventoryPilotMongo ??= new MongoClient(uri, {
    appName: "InventoryPilot",
    serverSelectionTimeoutMS: 10_000,
  })
    .connect()
    .catch((error: unknown) => {
      // Let the next request try again instead of caching the failure.
      globalForMongo.inventoryPilotMongo = undefined;
      throw error;
    });
  return globalForMongo.inventoryPilotMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DB_NAME);
}

export function isMongoError(error: unknown): boolean {
  return error instanceof Error && error.name.startsWith("Mongo");
}

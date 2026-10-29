import { connection } from "next/server";
import { getDb } from "@/lib/db/mongodb";
import { checkEnvironment } from "@/lib/shopify/config";
import { listTokenSummaries, type TokenSummary } from "@/lib/shopify/mongo-token-store";

/**
 * Development-only check of environment variables, the database connection and stored
 * offline tokens. Reports "set" / "missing" / "invalid" and token metadata, never values.
 */
export async function GET() {
  await connection();
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  let database: { status: "ok"; offlineTokens: TokenSummary[] } | { status: "error"; message: string };
  try {
    await (await getDb()).command({ ping: 1 });
    database = { status: "ok", offlineTokens: await listTokenSummaries() };
  } catch (error) {
    database = { status: "error", message: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error" };
  }

  return Response.json(
    { environment: checkEnvironment(), database },
    { headers: { "Cache-Control": "no-store" } },
  );               
}

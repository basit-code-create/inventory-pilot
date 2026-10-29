import "server-only";

import { errors, jwtVerify, type JWTPayload } from "jose";
import { normalizeShopDomain } from "./shared";

export interface SessionToken {
  /** e.g. example.myshopify.com, taken from the verified `dest` claim. */
  shop: string;
  userId: string | null;
  sessionId: string | null;
  expiresAt: number;
}

export class InvalidSessionTokenError extends Error {
  override name = "InvalidSessionTokenError";
  constructor(readonly reason: string) {
    super(`Invalid session token: ${reason}.`);
  }
}

// Allows for small clock differences between this server and Shopify.
const CLOCK_TOLERANCE_SECONDS = 10;

export function readBearerToken(authorization: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "");
  return match ? match[1] : null;
}

function httpsHostname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function describeVerificationError(error: unknown): string {
  if (error instanceof errors.JWTExpired) return "it has expired";
  if (error instanceof errors.JWTClaimValidationFailed) return `the ${error.claim} claim failed validation`;
  if (error instanceof errors.JWSSignatureVerificationFailed) return "the signature doesn't match the client secret";
  if (error instanceof errors.JOSEAlgNotAllowed) return "it isn't signed with HS256";
  return "it isn't a well-formed JWT";
}

/**
 * Verifies an App Bridge session (ID) token as Shopify documents it: an HS256 signature made
 * with the app's client secret, exp in the future, nbf in the past, aud equal to the client ID,
 * and iss and dest on the same myshopify.com hostname.
 */
export async function verifySessionToken(
  token: string,
  config: { clientId: string; clientSecret: string },
): Promise<SessionToken> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(config.clientSecret), {
      algorithms: ["HS256"],
      audience: config.clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["exp", "nbf", "aud", "iss", "dest"],
    }));
  } catch (error) {
    throw new InvalidSessionTokenError(describeVerificationError(error));
  }

  const issuer = httpsHostname(payload.iss);
  const destination = httpsHostname(payload.dest);
  if (!issuer || !destination) throw new InvalidSessionTokenError("iss and dest must be https URLs");
  if (issuer !== destination) throw new InvalidSessionTokenError("iss and dest are different shops");

  const shop = normalizeShopDomain(destination);
  if (!shop) throw new InvalidSessionTokenError("dest isn't a myshopify.com domain");

  return {
    shop,
    userId: typeof payload.sub === "string" ? payload.sub : null,
    sessionId: typeof payload.sid === "string" ? payload.sid : null,
    expiresAt: (payload.exp ?? 0) * 1000,
  };
}

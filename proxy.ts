import { NextResponse, type NextRequest } from "next/server";
import { normalizeShopDomain } from "./lib/shopify/shared";

/**
 * Clickjacking protection that Shopify requires for embedded apps: only the shop's own admin
 * may frame the app. Pages opened without a valid shop can't be framed at all.
 */
export function proxy(request: NextRequest) {
  const shop = normalizeShopDomain(request.nextUrl.searchParams.get("shop"));
  const frameAncestors = shop ? `https://${shop} https://admin.shopify.com` : "'none'";

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);
  return response;
}

export const config = {
  // Every route that renders HTML; API routes and static assets don't need the header.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};

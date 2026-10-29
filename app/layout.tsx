import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Inter is the Shopify admin typeface.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InventoryPilot",
  description: "Smart inventory reorder assistant for Shopify.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* App Bridge reads the client ID (public, not the secret) from this tag, so it comes first. */}
        <meta name="shopify-api-key" content={process.env.SHOPIFY_CLIENT_ID ?? ""} />
        {/* Shopify requires App Bridge to load from its CDN as a blocking script, not async or deferred. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      {/* Browser extensions add attributes to <body> before React loads; this ignores only those, on this element. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

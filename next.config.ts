import type { NextConfig } from "next";

/** The HTTPS dev tunnel (SHOPIFY_APP_URL) must be allowed to load dev assets and HMR. */
function tunnelHostnames(): string[] {
  try {
    return process.env.SHOPIFY_APP_URL ? [new URL(process.env.SHOPIFY_APP_URL).hostname] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelHostnames(),
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

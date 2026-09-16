import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const devOrigin = siteUrl?.startsWith("https://") ? new URL(siteUrl).hostname : undefined;

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: devOrigin ? [devOrigin] : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
    ],
  },
};

export default nextConfig;

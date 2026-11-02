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
  async headers() { return [{ source: '/events/aanmelden/:path*', headers: [
    { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }]; },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
    ],
  },
};

export default nextConfig;

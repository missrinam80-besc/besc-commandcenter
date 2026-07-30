import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

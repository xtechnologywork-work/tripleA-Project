import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A second local copy (demo mode, no Supabase) can run beside the real one: set NEXT_DIST_DIR
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "**.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.loca.lt",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.trycloudflare.com",
        "**.trycloudflare.com",
        "*.ngrok-free.app",
        "*.ngrok.io",
        "*.loca.lt",
      ],
    },
  },
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; it must not be bundled by the server
  // compiler or the prebuilt .node binary will be lost. Next 16 renamed this
  // from experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["better-sqlite3"],
  images: {
    // Allow the upstream image hosts the feed proxies through to.
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: ["*.up.railway.app", "*.railway.internal"],
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

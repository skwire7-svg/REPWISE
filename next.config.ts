import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // The AI plan/diet routes call Anthropic with adaptive thinking and can run
    // well past the default serverless timeout. Keep them on the Node runtime.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

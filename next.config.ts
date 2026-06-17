import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in a parent directory doesn't confuse Turbopack.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

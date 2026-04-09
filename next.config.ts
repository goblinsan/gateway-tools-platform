import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Produce a standalone server bundle so the Docker image only ships the
   * files needed at runtime (no node_modules or dev dependencies).
   * See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
   */
  output: "standalone",
};

export default nextConfig;

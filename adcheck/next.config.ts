import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The policy knowledge base is read from disk at runtime; make sure it is
  // bundled with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./knowledge/**"],
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

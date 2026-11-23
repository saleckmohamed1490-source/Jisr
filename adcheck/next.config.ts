import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The policy knowledge base and legal pages are read from disk at runtime;
  // make sure they are bundled with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./knowledge/**"],
    "/[locale]/**": ["./content/**"],
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

export default withNextIntl(nextConfig);

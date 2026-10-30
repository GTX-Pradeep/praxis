import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live database data per request, so we keep the
  // classic dynamic rendering model instead of Cache Components.
  cacheComponents: false,
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

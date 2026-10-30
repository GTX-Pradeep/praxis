import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live database data per request, so we keep the
  // classic dynamic rendering model instead of Cache Components.
  cacheComponents: false,
  // Loaded from node_modules at runtime instead of bundled, so the PDF
  // library can find its worker file.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
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

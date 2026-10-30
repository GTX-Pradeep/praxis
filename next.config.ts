import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live database data per request, so we keep the
  // classic dynamic rendering model instead of Cache Components.
  cacheComponents: false,
  // Loaded from node_modules at runtime instead of bundled: the PDF library
  // needs its worker file and the embedding model needs native ONNX binaries.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@huggingface/transformers", "onnxruntime-node", "sharp"],
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

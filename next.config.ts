import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only extractors need to stay external (they read pdf.js worker / docx xml at runtime).
  // pdfkit/pptxgenjs are bundled to avoid ESM/CJS default mismatch in production (was causing 500 HTML).
  serverExternalPackages: ["mammoth", "unpdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

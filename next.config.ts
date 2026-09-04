import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Document renderers/extractors read assets from their own package folders at
  // runtime (fonts, pdf.js worker), so they must not be bundled.
  serverExternalPackages: ["pdfkit", "pptxgenjs", "mammoth", "unpdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext applies this ceiling to multipart requests before route handlers.
  // Owner-only photo uploads enforce 8 MB per file; allow form overhead here.
  experimental: {serverActions: {bodySizeLimit: '9mb'}},
};

export default nextConfig;

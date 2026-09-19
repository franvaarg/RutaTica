import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the development badge from covering mobile map/results controls.
  devIndicators: false,
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingIncludes: {
    '/api/**': ['./db/custom.db'],
    '/api/download': ['./Bitacora_RutaTica.docx'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    useTypeScriptCli: false,
  },
  reactStrictMode: false,
};

export default nextConfig;

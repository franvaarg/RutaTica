import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

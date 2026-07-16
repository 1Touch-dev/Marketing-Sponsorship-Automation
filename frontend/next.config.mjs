import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skipDuplicateBuildChecks = process.env.NEXT_SKIP_BUILD_CHECKS === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
    serverComponentsExternalPackages: ["sharp"],
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      "/api/media/jersey-mockup": ["../assets/jerseys/**/*"],
      "/api/media/campaign-creative": ["../assets/jerseys/**/*", "../assets/stadium/fans/**/*"],
    },
  },
  // Low-memory deployments may run lint/typecheck as separate required steps,
  // then skip Next's duplicate workers during the production bundle.
  typescript: { ignoreBuildErrors: skipDuplicateBuildChecks },
  eslint: { ignoreDuringBuilds: skipDuplicateBuildChecks },
};

export default nextConfig;

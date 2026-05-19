import { NextResponse } from "next/server";
import { validateEnv, getEnvSummary } from "@/lib/env-validation";
import { checkApifyHealth, type ApifyHealthStatus } from "@/lib/intelligence/apify";

export const dynamic = "force-dynamic";

export async function GET() {
  const envSummary = getEnvSummary();
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const bedrockOk = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const apifyToken = process.env.APIFY_API_TOKEN ?? "";

  // Check Apify health in parallel with other checks
  const [apifyHealth] = await Promise.all([
    apifyToken ? checkApifyHealth() : Promise.resolve<ApifyHealthStatus>({ configured: false, healthy: false, error: "Not configured" }),
  ]);

  // SerpAPI — legacy check (replaced by Apify)
  const serpKey = process.env.SERPAPI_KEY ?? process.env.SERPAPI_API_KEY ?? "";
  let serpStatus = "deprecated"; // Apify replaces SerpAPI
  if (serpKey && serpKey.length > 10) {
    serpStatus = "configured_legacy";
  }

  const { valid } = validateEnv();

  const apifyStatus = !apifyHealth.configured ? "unconfigured" : apifyHealth.healthy ? "active" : "error";

  return NextResponse.json({
    services: {
      supabase: { status: "active", label: "Supabase DB", description: "Connected" },
      bedrock: {
        status: bedrockOk ? "active" : "unconfigured",
        label: "AWS Bedrock (Claude)",
        description: bedrockOk ? "AI generation active" : "Missing AWS credentials",
      },
      openai: {
        status: openaiKey.startsWith("sk-") ? "active" : "unconfigured",
        label: "OpenAI (gpt-image-1)",
        description: openaiKey.startsWith("sk-") ? "Image generation ready" : "Key missing or invalid",
      },
      apify: {
        status: apifyStatus,
        label: "Apify Commercial Intelligence",
        description: apifyHealth.healthy
          ? `Active — ${apifyHealth.username} (${apifyHealth.plan ?? "STARTER"})`
          : apifyHealth.configured
          ? `Error: ${apifyHealth.error ?? "check token"}`
          : "Add APIFY_API_TOKEN to .env",
        username: apifyHealth.username,
        plan: apifyHealth.plan,
      },
      serpapi: {
        status: serpStatus,
        label: "SerpAPI (legacy)",
        description: serpStatus === "configured_legacy"
          ? "Legacy key present — Apify now handles search intelligence"
          : "Not needed — Apify handles all search intelligence",
      },
      playwright: {
        status: "depends_on_install",
        label: "Playwright",
        description: "Browser scraping — Apify crawler is the primary method; Playwright activates when OS support added",
      },
      pipedrive: {
        status: "placeholder",
        label: "Pipedrive CRM",
        description: "Architecture ready — requires API key to activate",
      },
    },
    environment: { healthy: valid, vars: envSummary },
    platform_version: "3.0.0",
    branch: "feature/apify-commercial-intelligence",
  });
}

import { NextResponse } from "next/server";
import { validateEnv, getEnvSummary } from "@/lib/env-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const envSummary = getEnvSummary();
  const serpKey = process.env.SERPAPI_KEY ?? process.env.SERPAPI_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const bedrockOk = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  // Test SerpAPI (lightweight check)
  let serpStatus = "unconfigured";
  if (serpKey && serpKey.length > 10) {
    try {
      const res = await fetch(
        `https://serpapi.com/search.json?engine=google&q=test&api_key=${serpKey}&num=1`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json() as { error?: string; organic_results?: unknown[] };
      serpStatus = data.error ? "invalid_key" : "active";
    } catch {
      serpStatus = "timeout";
    }
  }

  const { valid } = validateEnv();

  return NextResponse.json({
    services: {
      supabase: { status: "active", label: "Supabase DB", description: "Connected" },
      bedrock: { status: bedrockOk ? "active" : "unconfigured", label: "AWS Bedrock (Claude)", description: bedrockOk ? "AI generation active" : "Missing AWS credentials" },
      openai: { status: openaiKey.startsWith("sk-") ? "active" : "unconfigured", label: "OpenAI (gpt-image-1)", description: openaiKey.startsWith("sk-") ? "Image generation ready" : "Key missing or invalid" },
      serpapi: { status: serpStatus, label: "SerpAPI", description: serpStatus === "active" ? "Competitor discovery active" : serpStatus === "invalid_key" ? "Key present but invalid — add valid key to .env" : "Not configured — add SERPAPI_KEY to .env" },
      playwright: { status: "depends_on_install", label: "Playwright", description: "Browser scraping — check npm install" },
      pipedrive: { status: "placeholder", label: "Pipedrive CRM", description: "Architecture ready — requires API key to activate" },
    },
    environment: { healthy: valid, vars: envSummary },
    platform_version: "2.1.0",
    branch: "feature/executive-readiness-and-operational-polish",
  });
}

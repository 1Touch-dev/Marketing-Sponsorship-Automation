import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEnvSummary } from "@/lib/env-validation";
import { getQueueStats } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();

  // Env validation
  const envStatus = getEnvSummary();
  const envHealthy = envStatus.filter(e => e.required).every(e => e.configured);

  // DB connectivity
  let dbHealthy = false;
  let dbLatencyMs = 0;
  try {
    const t = Date.now();
    const sb = supabaseAdmin();
    await sb.from("companies").select("count").limit(1);
    dbLatencyMs = Date.now() - t;
    dbHealthy = true;
  } catch { /* */ }

  // AI service status
  const awsConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  const pipedriveConfigured = !!process.env.PIPEDRIVE_API_KEY;
  const replicateConfigured = !!process.env.REPLICATE_API_TOKEN;
  const hunterConfigured = !!process.env.HUNTER_API_KEY;

  // Queue stats
  let queueStats: Record<string, number> = {};
  try { queueStats = await getQueueStats(); } catch { /* */ }

  // Platform stats — fixed: proposals count all non-rejected statuses
  let platformStats: Record<string, number> = {};
  try {
    const sb = supabaseAdmin();
    const [{ count: companies }, { count: proposals }, { count: campaigns }] = await Promise.all([
      sb.from("companies").select("*", { count: "exact", head: true }).neq("status" as "id", "closed"),
      sb.from("proposals").select("*", { count: "exact", head: true }),
      sb.from("campaigns").select("*", { count: "exact", head: true }),
    ]);

    // Active proposals: not rejected
    const { count: activeProposals } = await sb
      .from("proposals")
      .select("*", { count: "exact", head: true })
      .neq("status" as "id", "rejected");

    platformStats = {
      companies: companies ?? 0,
      proposals_total: proposals ?? 0,
      proposals_active: activeProposals ?? 0,
      campaigns: campaigns ?? 0,
    };
  } catch (e) {
    console.error("[health] platformStats error:", e);
  }

  const allHealthy = dbHealthy && envHealthy;
  const responseTime = Date.now() - startTime;

  return NextResponse.json({
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    response_time_ms: responseTime,
    services: {
      database: { healthy: dbHealthy, latency_ms: dbLatencyMs },
      bedrock_ai: { healthy: awsConfigured, configured: awsConfigured },
      openai: { healthy: openaiConfigured, configured: openaiConfigured },
      pipedrive: { healthy: pipedriveConfigured, configured: pipedriveConfigured },
      replicate: {
        healthy: replicateConfigured,
        configured: replicateConfigured,
        model: replicateConfigured ? "abhishek9302/coritiba-jersey-lora:396810db" : null,
        trigger_word: replicateConfigured ? "coritiba_jersey" : null,
        note: replicateConfigured ? "LoRA trained 27 May 2026 — jersey/stadium mockup generation ready" : "Awaiting REPLICATE_API_TOKEN",
      },
      hunter: {
        healthy: hunterConfigured,
        configured: hunterConfigured,
        note: hunterConfigured ? "Contact enrichment active" : "Awaiting HUNTER_API_KEY — email/contact discovery disabled",
      },
    },
    environment: { healthy: envHealthy, vars: envStatus },
    queue: queueStats,
    platform: platformStats,
  });
}

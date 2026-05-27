import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Lightweight public health check — returns DB connectivity only.
 * Does NOT call Bedrock (to keep latency low and costs zero).
 * Full service health (including Bedrock, OpenAI, Pipedrive, Replicate) is at /api/system/health.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

  const sbStart = Date.now();
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("audit_logs").select("id").limit(1);
    checks.database = { ok: !error, latency_ms: Date.now() - sbStart, error: error?.message };
  } catch (e) {
    checks.database = { ok: false, latency_ms: Date.now() - sbStart, error: String(e) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 207 },
  );
}

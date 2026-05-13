import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";

export const runtime = "nodejs";

/**
 * GET /api/health
 * Returns the health status of Supabase and Bedrock connectivity.
 * Safe to expose — no secrets returned.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

  // --- Supabase ---
  const sbStart = Date.now();
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("audit_logs").select("id").limit(1);
    checks.supabase = { ok: !error, latency_ms: Date.now() - sbStart, error: error?.message };
  } catch (e) {
    checks.supabase = { ok: false, latency_ms: Date.now() - sbStart, error: String(e) };
  }

  // --- Bedrock ---
  const bStart = Date.now();
  try {
    const result = await invokeClaude({
      messages: [{ role: "user", content: 'Reply with the single word "ok"' }],
      maxTokens: 5,
      temperature: 0,
    });
    checks.bedrock = {
      ok: result.text.toLowerCase().includes("ok"),
      latency_ms: Date.now() - bStart,
    };
  } catch (e) {
    checks.bedrock = { ok: false, latency_ms: Date.now() - bStart, error: String(e) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 207 },
  );
}

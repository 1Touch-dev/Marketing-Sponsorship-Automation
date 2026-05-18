import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 60;

const COMPETITOR_NAMES = [
  "athletico", "athletico paranaense", "furacão", "furacao", "caf",
  "corinthians", "flamengo", "palmeiras", "grêmio", "gremio",
  "internacional", "são paulo fc", "sao paulo fc",
];

const COMPETITOR_PROPOSAL_TITLES_KEYWORDS = [
  "athletico", "furacão", "furacao", "corinthians", "flamengo",
  "palmeiras", "grêmio", "gremio", "internacional", "são paulo",
];

export async function GET() {
  const sb = supabaseAdmin();

  // Count current issues
  const [failedWorkflows, competitorProposals, testCompanies, validationAuditLogs] = await Promise.all([
    sb.from("workflow_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    sb.from("proposals").select("id, title, status").not("status", "eq", "rejected"),
    sb.from("companies").select("id, company_name, status").neq("status", "closed"),
    sb.from("audit_logs").select("id", { count: "exact", head: true })
      .like("action", "ai.validation_failed%"),
  ]);

  // Find competitor content in active proposals
  const activeProposals = (competitorProposals.data ?? []).filter((p) =>
    COMPETITOR_PROPOSAL_TITLES_KEYWORDS.some((k) =>
      (p.title ?? "").toLowerCase().includes(k)
    )
  );

  // Find test companies
  const testKeywords = ["test", "sample", "demo", "diagnostic", "example", "url co", "fix co"];
  const testCos = (testCompanies.data ?? []).filter((c) =>
    testKeywords.some((k) => (c.company_name ?? "").toLowerCase().includes(k))
  );

  return NextResponse.json({
    health: {
      failed_workflows: failedWorkflows.count ?? 0,
      competitor_proposals_visible: activeProposals.length,
      test_companies_visible: testCos.length,
      ai_validation_failures_total: validationAuditLogs.count ?? 0,
    },
    competitor_proposals: activeProposals.map((p) => ({ id: p.id, title: p.title, status: p.status })),
    test_companies: testCos.map((c) => ({ id: c.id, name: c.company_name })),
    is_demo_ready: (failedWorkflows.count ?? 0) === 0 && activeProposals.length === 0,
  });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const { action } = await req.json().catch(() => ({ action: null }));

  if (!action) {
    return NextResponse.json({ error: "Provide action" }, { status: 400 });
  }

  // ── Resolve failed workflows ──────────────────────────────────────────────
  if (action === "resolve_failed_workflows") {
    const { data: failed } = await sb
      .from("workflow_events")
      .select("id")
      .eq("status", "failed");

    const ids = (failed ?? []).map((e) => e.id);
    if (ids.length === 0) return NextResponse.json({ success: true, resolved: 0 });

    await sb
      .from("workflow_events")
      .update({
        status: "completed",
        metadata: { auto_resolved: true, resolution: "Resolved by maintenance tool" } as unknown,
      })
      .in("id", ids);

    await recordAudit({
      entity_type: "system",
      entity_id: null,
      action: "system.maintenance",
      metadata: { action: "resolve_failed_workflows", count: ids.length },
    });

    return NextResponse.json({ success: true, resolved: ids.length });
  }

  // ── Archive competitor proposals ──────────────────────────────────────────
  if (action === "archive_competitor_proposals") {
    const { data: proposals } = await sb
      .from("proposals")
      .select("id, title, status")
      .not("status", "eq", "rejected")
      .not("status", "eq", "cancelled");

    const competitorOnes = (proposals ?? []).filter((p) =>
      COMPETITOR_PROPOSAL_TITLES_KEYWORDS.some((k) =>
        (p.title ?? "").toLowerCase().includes(k)
      )
    );

    if (competitorOnes.length === 0) {
      return NextResponse.json({ success: true, archived: 0, message: "No competitor proposals found" });
    }

    const ids = competitorOnes.map((p) => p.id);
    await sb
      .from("proposals")
      .update({ status: "rejected", status_reason: "competitor_content_archived" })
      .in("id", ids);

    await recordAudit({
      entity_type: "system",
      entity_id: null,
      action: "system.maintenance",
      metadata: { action: "archive_competitor_proposals", count: ids.length, archived_titles: competitorOnes.map((p) => p.title) },
    });

    return NextResponse.json({ success: true, archived: ids.length, titles: competitorOnes.map((p) => p.title) });
  }

  // ── Archive test companies ────────────────────────────────────────────────
  if (action === "archive_test_companies") {
    const testKeywords = ["test", "sample", "demo", "diagnostic", "example", "url co", "fix co"];
    const { data: companies } = await sb
      .from("companies")
      .select("id, company_name")
      .neq("status", "closed");

    const testCos = (companies ?? []).filter((c) =>
      testKeywords.some((k) => (c.company_name ?? "").toLowerCase().includes(k))
    );

    if (testCos.length === 0) {
      return NextResponse.json({ success: true, archived: 0, message: "No test companies found" });
    }

    const ids = testCos.map((c) => c.id);
    await sb.from("companies").update({ status: "closed" }).in("id", ids);

    await recordAudit({
      entity_type: "system",
      entity_id: null,
      action: "system.maintenance",
      metadata: { action: "archive_test_companies", count: ids.length },
    });

    return NextResponse.json({ success: true, archived: ids.length, companies: testCos.map((c) => c.company_name) });
  }

  // ── Refresh workflow health (mark stale processing as failed) ─────────────
  if (action === "refresh_workflow_health") {
    // Mark any workflows stuck in 'started' or 'processing' for >30min as failed
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stale } = await sb
      .from("workflow_events")
      .select("id")
      .in("status", ["started", "processing"])
      .lt("created_at", cutoff);

    const ids = (stale ?? []).map((e) => e.id);
    if (ids.length > 0) {
      await sb
        .from("workflow_events")
        .update({ status: "failed", error_message: "Stale workflow — auto-failed after 30min timeout" })
        .in("id", ids);
    }

    return NextResponse.json({ success: true, stale_resolved: ids.length });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

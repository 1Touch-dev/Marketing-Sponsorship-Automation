import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { CORITIBA_CONTEXT } from "@/lib/bedrock/prompts";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/proposals/backfill-deliverables
 *
 * Finds all proposals where content.deliverables is missing or empty
 * and regenerates deliverables for each using Claude.
 *
 * Query params:
 *   limit   - max proposals to process per call (default 10, max 50)
 *   dry_run - if "true" just counts affected proposals without fixing
 */
export async function POST(req: Request) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "10"));

  const sb = supabaseAdmin();

  // Fetch proposals missing deliverables
  const { data: proposals, error } = await sb
    .from("proposals")
    .select("id, title, content, campaigns(title), companies(company_name, industry)")
    .order("created_at", { ascending: false })
    .limit(200); // fetch more than limit so we can filter

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type ProposalRow = {
    id: string;
    title: string;
    content: Record<string, unknown> | null;
    campaigns: { title: string } | null;
    companies: { company_name: string; industry: string | null } | null;
  };

  const needsBackfill = (proposals as unknown as ProposalRow[]).filter((p) => {
    const content = p.content as Record<string, unknown> | null;
    const deliverables = content?.deliverables;
    return !deliverables || !Array.isArray(deliverables) || (deliverables as unknown[]).length === 0;
  });

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      total_needing_backfill: needsBackfill.length,
      sample: needsBackfill.slice(0, 5).map((p) => ({ id: p.id, title: p.title })),
    });
  }

  const batch = needsBackfill.slice(0, limit);
  const results: { id: string; status: string; deliverables?: string[] }[] = [];

  for (const proposal of batch) {
    try {
      const companyName = (proposal as ProposalRow).companies?.company_name ?? "the sponsor";
      const industry = (proposal as ProposalRow).companies?.industry ?? "";
      const campaignTitle = (proposal as ProposalRow).campaigns?.title ?? "";
      const content = (proposal as ProposalRow).content as Record<string, unknown> | null;

      const system = [
        "You are a sponsorship sales director at Coritiba Foot Ball Club.",
        "Generate exactly 5 concrete, measurable deliverables for a Coritiba FC sponsorship.",
        "Each deliverable must reference a specific Coritiba FC asset with quantity.",
        "Examples: 'Jersey chest badge — 25 home + away matches', 'Couto Pereira LED perimeter — 3 min/match x 19 home games', 'Co-branded Instagram post — 4 posts/month'.",
        "Output MUST be valid JSON: { \"deliverables\": [\"item1\", \"item2\", \"item3\", \"item4\", \"item5\"] }",
        "",
        CORITIBA_CONTEXT,
      ].join("\n");

      const user = [
        `Sponsor company: ${companyName}`,
        industry ? `Industry: ${industry}` : null,
        campaignTitle ? `Campaign: ${campaignTitle}` : null,
        content?.activation_plan ? `Activation context: ${String(content.activation_plan).slice(0, 500)}` : null,
        "",
        "Generate 5 specific deliverables for this Coritiba FC sponsorship package.",
      ]
        .filter(Boolean)
        .join("\n");

      const result = await invokeClaude<{ deliverables: string[] }>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 600,
        temperature: 0.5,
      });

      const deliverables = result.json?.deliverables;
      if (!Array.isArray(deliverables) || deliverables.length === 0) {
        results.push({ id: proposal.id, status: "error: empty AI response" });
        continue;
      }

      // Merge into existing content
      const updatedContent = { ...(content ?? {}), deliverables };
      const { error: updateErr } = await sb
        .from("proposals")
        .update({ content: updatedContent })
        .eq("id", proposal.id);

      if (updateErr) {
        results.push({ id: proposal.id, status: `error: ${updateErr.message}` });
      } else {
        results.push({ id: proposal.id, status: "ok", deliverables });
      }
    } catch (err) {
      results.push({ id: proposal.id, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
    }
  }

  return NextResponse.json({
    processed: results.length,
    total_needing_backfill: needsBackfill.length,
    remaining: Math.max(0, needsBackfill.length - limit),
    results,
  });
}

/** GET /api/proposals/backfill-deliverables — just report count */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: proposals, error } = await sb
    .from("proposals")
    .select("id, content")
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const count = (proposals ?? []).filter((p) => {
    const deliverables = (p.content as Record<string, unknown> | null)?.deliverables;
    return !deliverables || !Array.isArray(deliverables) || (deliverables as unknown[]).length === 0;
  }).length;

  return NextResponse.json({
    proposals_missing_deliverables: count,
    total_fetched: proposals?.length ?? 0,
  });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { opportunityGapPrompt } from "@/lib/bedrock/prompts";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * White-space / opportunity-gap finder (Phase 6 — master_report.md Section 4).
 * GET: returns the cached result (from companies.full_intelligence.opportunity_gap).
 * POST: (re-)generates it from real sponsorship_history / competitor data and caches it.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, full_intelligence")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const intel = (company.full_intelligence ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    company_id: company.id,
    opportunity_gap: intel.opportunity_gap ?? null,
  });
}

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, industry, website, country, notes, full_intelligence")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const intel = (company.full_intelligence ?? {}) as Record<string, unknown>;
  const sponsorshipHistory = typeof intel.sponsorship_history === "string" ? intel.sponsorship_history : null;
  const competitors = (Array.isArray(intel.competitors) ? intel.competitors : []) as Array<Record<string, unknown>>;

  try {
    const pt = opportunityGapPrompt({
      company: {
        company_name: company.company_name,
        industry: company.industry,
        website: company.website,
        country: company.country ?? "BR",
        notes: company.notes,
      },
      sponsorshipHistory,
      competitors: competitors.map((c) => ({
        name: String(c.name ?? ""),
        sponsorshipHistory: typeof c.sponsorship_history === "string" ? c.sponsorship_history : null,
      })),
    });

    const result = await invokeClaude<{
      grounded: boolean;
      current_sponsorship_summary: string;
      gap_summary: string;
      opportunity_angle: string;
    }>({
      system: pt.system,
      messages: [{ role: "user", content: pt.user }],
      json: true,
      maxTokens: 800,
    });

    if (!result.json) throw new Error("AI returned invalid response");

    const opportunityGap = {
      ...result.json,
      generated_at: new Date().toISOString(),
    };

    const updatedIntelligence = { ...intel, opportunity_gap: opportunityGap };
    await sb
      .from("companies")
      .update({ full_intelligence: updatedIntelligence } as unknown as Record<string, unknown>)
      .eq("id", company.id);

    return NextResponse.json({ company_id: company.id, opportunity_gap: opportunityGap });
  } catch (err) {
    console.error("[companies/opportunity-gap]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Opportunity gap analysis failed" },
      { status: 500 },
    );
  }
}

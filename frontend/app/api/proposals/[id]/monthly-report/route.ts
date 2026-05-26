import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ProposalContent } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`monthly-report:${ip}`, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(company_name, industry, country, contact_name, contact_email, website), campaigns(title, summary)")
    .eq("id", params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "active_contract") {
    return NextResponse.json({ error: "Reports are only available for active contracts" }, { status: 400 });
  }

  const p = proposal as typeof proposal & {
    companies: { company_name: string; industry: string | null; country: string | null; contact_name: string | null; contact_email: string | null; website: string | null } | null;
    campaigns: { title: string; summary: string | null } | null;
  };

  const content = proposal.content as unknown as ProposalContent & { execution_brief?: { items?: Array<{ title?: string; description?: string }> } };
  const executionItems = content?.execution_brief?.items ?? [];

  const today = new Date();
  const monthYear = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const system = `You are a Coritiba FC sponsorship account manager writing a professional monthly activation report.
Write clearly, confidently, and specifically — this goes directly to the sponsor.`;

  const userPrompt = `Write a monthly sponsorship activation report for ${monthYear}.

Sponsor: ${p.companies?.company_name ?? "Sponsor"}
Industry: ${p.companies?.industry ?? "—"}
Campaign: ${p.campaigns?.title ?? proposal.title}
Contact: ${p.companies?.contact_name ?? "—"} (${p.companies?.contact_email ?? "—"})

Proposal Summary:
${content?.executive_summary ?? ""}

Activation Plan:
${content?.activation_plan ?? ""}

Execution items (checklist):
${executionItems.length > 0
  ? executionItems.slice(0, 8).map((item) => `- ${item.title ?? ""}: ${item.description ?? ""}`).join("\n")
  : "(See activation plan above)"
}

Write a professional monthly report with these sections:
1. **Month in Review** — what activations happened at Couto Pereira and digitally
2. **Key Highlights** — 3–5 bullet points of notable moments or results
3. **Metrics & Reach** — estimated/projected reach numbers for the month
4. **Next Month Preview** — what activations are planned
5. **Action Items** — 2–3 items for the Coritiba FC team and sponsor team

Keep the tone professional but warm. Use the specific sponsor name and Coritiba FC context throughout.
Length: ~350–450 words.`;

  try {
    const result = await invokeClaude<string>({
      system,
      messages: [{ role: "user", content: userPrompt }],
      json: false,
      maxTokens: 1200,
      temperature: 0.65,
    });

    const reportText = result.text ?? "";

    return NextResponse.json({
      report: reportText,
      sponsor: p.companies?.company_name,
      month: monthYear,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}

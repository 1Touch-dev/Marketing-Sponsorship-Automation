import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveClubContext } from "@/lib/tenants/club-context";
import type { ClubContextInput } from "@/lib/bedrock/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Field names below (coritiba_fit_score, coritiba_fit_rationale) are kept as
// literal JSON keys for backward-compatibility with already-stored company
// intelligence rows and lib/proposals/generate-for-company.ts, which both
// read these exact keys — only the human-readable prompt text is tenant-ized.
const INTELLIGENCE_PROMPT = (
  name: string,
  industry: string | null,
  website: string | null,
  notes: string | null,
  tenant: ClubContextInput,
) => {
  const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;
  const region = [tenant.club_facts.city, tenant.club_facts.state].filter(Boolean).join(", ") || "its home region";
  const stadium = tenant.club_facts.stadium_name ? `, that plays at the ${tenant.club_facts.stadium_name}` : "";
  const audience = tenant.club_facts.follower_count ? `${clubName} ${tenant.club_facts.follower_count}` : `${clubName}'s fanbase`;

  return `You are a senior commercial sponsorship strategist for ${clubName}, a top Brazilian football club based in ${region}${stadium}.

Analyze the company "${name}" and generate deep commercial intelligence to guide sponsorship approach.

Company details:
- Name: ${name}
- Industry: ${industry || "Unknown"}
- Website: ${website || "Not provided"}
- Notes: ${notes || "None"}

Return raw JSON only (no markdown, no code fences, no prose). Include all fields:
{
  "products_services": "Brief description of main products/services",
  "marketing_goals": "Likely marketing goals and priorities",
  "brand_positioning": "How they position their brand in the market",
  "target_audience": "Their primary target audience/customer demographic",
  "audience_alignment": "How their audience aligns with ${audience}",
  "coritiba_fit_score": 8,
  "coritiba_fit_rationale": "Why this company fits ${clubName} sponsorship",
  "recommended_direction": "Specific recommended sponsorship partnership direction for ${clubName}",
  "competitors": [
    {"name": "Real Company Name", "reason": "Why they are a direct competitor", "estimated_spend": "R$X/year", "sponsorship_active": true, "website": "domain.com.br"}
  ],
  "local_context": "Specific ${region} regional market context",
  "global_inspiration": "Global campaign strategies from similar companies",
  "sponsorship_activation_ideas": "3-5 specific activation ideas leveraging ${clubName} assets",
  "key_messages": "Key messages to use when pitching to this company",
  "best_contact_timing": "Best time to approach for sponsorship"
}

Rules:
- coritiba_fit_score must be a number 1-10
- competitors must be 4-6 real companies (no football clubs)
- All text fields must contain real intelligence, not placeholders
- Focus on Brazilian market, ${region}
- DO NOT mention competitor football clubs${tenant.club_facts.rival_clubs?.length ? ` (${tenant.club_facts.rival_clubs.map((r) => r.split(" —")[0]).join(", ")}, etc.)` : ""}`;
};

export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  // Rate limit AI intelligence calls: 10 per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `intelligence:${ip}`, limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before running more intelligence analyses." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { company_id, company_name, industry, website, notes } = await req.json().catch(() => ({}));

  if (!company_id || !company_name) {
    return NextResponse.json({ error: "company_id and company_name required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  try {
    const { data: existing } = await sb
      .from("companies")
      .select("full_intelligence")
      .eq("id", company_id)
      .eq("tenant_id", auth.user.tenant_id)
      .maybeSingle();
    const existingIntelligence = (existing?.full_intelligence as Record<string, unknown>) ?? {};

    const tenant = await resolveClubContext(auth.user.tenant_id);
    const response = await invokeClaude({
      system: "You are a commercial intelligence analyst for Brazilian football club sponsorships. Always respond with valid JSON only. Never use markdown code blocks or code fences.",
      messages: [{ role: "user", content: INTELLIGENCE_PROMPT(company_name, industry, website, notes, tenant) }],
      maxTokens: 4096,
      json: true,
    });

    let intelligence: Record<string, unknown> = {};
    if (response.json) {
      if (Array.isArray(response.json)) {
        // Claude returned an array (likely competitors) — wrap it
        console.log("[intelligence] Claude returned array, wrapping as competitors");
        intelligence = { competitors: response.json };
      } else if (typeof response.json === "object" && response.json !== null) {
        intelligence = response.json as Record<string, unknown>;
      }
    }

    // If still empty, try manual parse
    if (Object.keys(intelligence).length === 0) {
      const rawText = (response.text ?? "").trim();
      console.log("[intelligence] manual parse needed, raw text first 150:", rawText.slice(0, 150));
      try {
        const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        try {
          const parsed = JSON.parse(stripped);
          if (Array.isArray(parsed)) {
            intelligence = { competitors: parsed };
          } else {
            intelligence = parsed;
          }
        } catch {
          const firstBrace = stripped.indexOf("{");
          const lastBrace = stripped.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            intelligence = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
          }
        }
        console.log("[intelligence] manual parse result keys:", Object.keys(intelligence).slice(0, 5));
      } catch (parseErr) {
        console.error("[intelligence] all parse attempts failed:", String(parseErr));
        return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
      }
    }

    // Normalize competitors — support both old string[] and new object[] formats
    let competitors: unknown[] = [];
    if (Array.isArray(intelligence.competitors)) {
      competitors = intelligence.competitors;
    } else if (Array.isArray(intelligence.competitor_brands)) {
      competitors = (intelligence.competitor_brands as string[]).map((name) => ({ name }));
    }

    // Save to DB — write to both columns for compatibility.
    // full_intelligence merges onto the existing row: differentiators/,
    // opportunity_gap, and discover-route fields all live as sibling keys in
    // this same JSON blob, and a plain overwrite here was silently deleting
    // them every time someone clicked "Re-analyze" (found live-testing on
    // Google's page: its differentiator analysis vanished after a re-run).
    const { data, error } = await sb
      .from("companies")
      .update({
        full_intelligence: { ...existingIntelligence, ...intelligence, competitors },
        intelligence: { ...intelligence, competitors },
        intelligence_updated_at: new Date().toISOString(),
        competitors: competitors.map((c) => (typeof c === "string" ? c : (c as Record<string,string>).name)),
      })
      .eq("id", company_id)
      .eq("tenant_id", auth.user.tenant_id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAudit({
      entity_type: "company",
      entity_id: company_id,
      action: "company.intelligence_generated",
      metadata: { company_name, fit_score: intelligence.coritiba_fit_score ?? intelligence.sponsorship_fit_score },
    });

    return NextResponse.json({ intelligence: { ...intelligence, competitors }, company: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

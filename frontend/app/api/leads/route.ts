/**
 * POST /api/leads
 * Public, unauthenticated lead-capture endpoint for the niche landing pages
 * (`master_report.md` §6.1 front doors — see docs/PHASE_9_GTM_PLAN.md).
 * No new table: a lead is just a `companies` row (status defaults to
 * "prospect", pipeline_stage set to "contact_lead" so it slots directly
 * onto the real Pipeline board) tagged with which landing page it came
 * from via discovery_method, exactly the pattern already used for
 * AI-discovered companies (discovery_method: "ai_auto" / "apify+claude").
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

const NICHES = ["sports-clubs", "nonprofits", "conferences", "chambers", "festivals"] as const;

const leadSchema = z.object({
  company_name: z.string().min(2).max(200),
  contact_name: z.string().max(200).optional(),
  contact_email: z.string().email().max(200),
  contact_phone: z.string().max(50).optional(),
  message: z.string().max(2000).optional(),
  niche: z.enum(NICHES),
  // Honeypot — real visitors never fill a field hidden with CSS; bots
  // filling every input on the form will. No length constraint here
  // deliberately — the emptiness check happens after parsing, so a
  // filled-in value still validates and reaches the silent-drop branch
  // below instead of surfacing a validation error that would tip off
  // even an unsophisticated bot.
  website_hp: z.string().optional(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`lead-capture:${ip}`, { max: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.website_hp) {
    // Silently accept-and-drop for suspected bots — don't tip them off.
    return NextResponse.json({ success: true });
  }

  const { company_name, contact_name, contact_email, contact_phone, message, niche } = parsed.data;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("companies")
    .insert({
      company_name,
      contact_name: contact_name ?? null,
      contact_email,
      contact_phone: contact_phone ?? null,
      notes: message ?? null,
      pipeline_stage: "contact_lead",
      discovery_method: `landing_page:${niche}`,
      tags: [`landing:${niche}`],
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not save your submission — please try again." }, { status: 500 });

  await recordAudit({
    entity_type: "company",
    entity_id: data.id,
    action: "company.lead_captured",
    metadata: { niche, source: "public_landing_page" },
  });

  return NextResponse.json({ success: true });
}

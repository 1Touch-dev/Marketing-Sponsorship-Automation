import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/proposals/wizard?session=<key>  — load draft
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get("session");
  if (!session) return NextResponse.json({ error: "session required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("proposal_wizard_drafts" as "companies")
    .select("*")
    .eq("session_key", session)
    .maybeSingle();

  return NextResponse.json({ draft: data ?? null });
}

// POST /api/proposals/wizard  — create or update draft
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sb = supabaseAdmin();

  const sessionKey = (body.session_key as string) ?? randomUUID();

  // Upsert wizard draft
  const { data, error } = await sb
    .from("proposal_wizard_drafts" as "companies")
    .upsert(
      {
        session_key: sessionKey,
        current_step: body.current_step ?? 1,
        proposal_type: body.proposal_type ?? "sponsorship",
        company_id: body.company_id ?? null,
        campaign_id: body.campaign_id ?? null,
        selected_components: body.selected_components ?? [],
        selected_strategies: body.selected_strategies ?? [],
        custom_brief: body.custom_brief ?? null,
        generation_options: body.generation_options ?? {},
        generated_proposal_id: body.generated_proposal_id ?? null,
        status: body.status ?? "in_progress",
      },
      { onConflict: "session_key" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data, session_key: sessionKey });
}

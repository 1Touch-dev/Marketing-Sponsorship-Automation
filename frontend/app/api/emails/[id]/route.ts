import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * PATCH /api/emails/:id
 * Body: { sender_profile_id?: string | null }
 *
 * Updates mutable fields on an email record (currently sender_profile_id).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("sender_profile_id" in body) {
    patch.sender_profile_id = body.sender_profile_id ?? null;

    // Also hydrate sender_name from the profile if provided
    if (body.sender_profile_id) {
      try {
        const { data: profile } = await sb
          .from("sender_profiles" as "companies")
          .select("full_name, title")
          .eq("id", String(body.sender_profile_id))
          .maybeSingle();
        if (profile) {
          const p = profile as Record<string, unknown>;
          if (p.full_name) patch.sender_name = p.full_name;
          if (p.title) patch.sender_title = p.title;
        }
      } catch { /* non-fatal */ }
    }
  }

  const { data, error } = await sb
    .from("emails")
    .update(patch)
    .eq("id", params.id)
    .select("id, sender_profile_id, sender_name, sender_title, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

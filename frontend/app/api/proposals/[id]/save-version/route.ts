import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? "Manual save";

  // Get current proposal
  const { data: proposal } = await sb
    .from("proposals")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Save snapshot to proposal_versions
  const { error } = await sb.from("proposal_versions").insert({
    proposal_id: params.id,
    version: proposal.version,
    content_md: proposal.content_md,
    content: proposal.content,
    title: proposal.title,
    edit_reason: reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump version on main proposal
  await sb
    .from("proposals")
    .update({ version: proposal.version + 1, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  // Log to audit
  await sb.from("audit_logs").insert({
    action: "proposal.version_saved",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: { version: proposal.version, reason },
  });

  return NextResponse.json({ ok: true, newVersion: proposal.version + 1 });
}

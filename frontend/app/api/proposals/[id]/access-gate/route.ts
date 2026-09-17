import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * PATCH /api/proposals/[id]/access-gate
 * Body: { enabled: boolean; type?: "passcode"|"nda"; passcode?: string|null; nda_text?: string|null }
 *
 * Deliberately separate from PATCH /api/proposals/[id] — that route bumps
 * the proposal's version and resets status to under_review on every save,
 * which would be a confusing side effect of just flipping an access-gate
 * toggle.
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  const type = body.type === "nda" ? "nda" : "passcode";

  const sb = supabaseAdmin();
  const { data: updated, error } = await sb
    .from("proposals")
    .update({
      access_gate_enabled: enabled,
      access_gate_type: type,
      access_gate_passcode: typeof body.passcode === "string" ? body.passcode.trim() || null : null,
      access_gate_nda_text: typeof body.nda_text === "string" ? body.nda_text.trim() || null : null,
    } as never)
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("id, access_gate_enabled, access_gate_type")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal",
    entity_id: ctx.params.id,
    action: enabled ? "proposal.access_gate_enabled" : "proposal.access_gate_disabled",
    metadata: { type },
  });

  return NextResponse.json({ data: updated });
}

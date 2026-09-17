import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { syncContractSignatureStatus } from "@/lib/documenso/sync-status";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/contracts/[id]/signature-status
 * Admin-triggered "Refresh Status" — re-fetches the real status from
 * Documenso rather than relying solely on the (not-yet-signature-verified)
 * webhook. See lib/documenso/sync-status.ts for the shared logic also
 * used by the webhook.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: contract } = await sb
    .from("contracts")
    .select("id")
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  try {
    const result = await syncContractSignatureStatus(contract.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to check signature status: ${message}` }, { status: 500 });
  }
}

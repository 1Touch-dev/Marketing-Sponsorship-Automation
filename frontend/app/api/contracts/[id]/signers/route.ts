import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { applySignerEvent, loadSignatureView, settleContractSignature } from "@/lib/contracts/signers-store";
import { serviceActor } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who has to sign, who has, and the contract's real signature state (one signer is not the whole contract). */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  // This path is exempt from the middleware's session check (it also receives
  // provider callbacks), so reading signers must check the session itself.
  const user = await getCurrentPlatformUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = user.tenant_id;
  const result = await loadSignatureView(supabaseAdmin(), tenantId, ctx.params.id);
  if (!result) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  return NextResponse.json({ signature: result.view, envelope_status: result.envelope, signers: result.signers });
}

const eventSchema = z.object({
  email: z.string().email(),
  status: z.enum(["sent", "opened", "signed", "declined"]),
  name: z.string().max(200).optional(),
  role: z.enum(["signer", "approver", "viewer", "assistant"]).optional(),
  required: z.boolean().optional(),
  signing_order: z.number().int().min(1).max(50).optional(),
  reason: z.string().max(500).optional(),
  at: z.string().datetime().optional(),
});

/**
 * Records one recipient's progress. Internal callers only (the e-signature
 * provider's callback or a scheduler): a person cannot record that someone
 * else signed.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get("x-internal-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || provided !== secret) return NextResponse.json({ error: "Internal callers only" }, { status: 403 });

  const parsed = eventSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: contract } = await sb.from("contracts").select("id, tenant_id").eq("id", ctx.params.id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const tenantId = (contract as { tenant_id: string }).tenant_id;

  const r = await applySignerEvent(sb, tenantId, ctx.params.id, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Could not record signer event", migration_needed: r.skipped === "migration_missing" || undefined }, { status: r.skipped === "migration_missing" ? 503 : 500 });

  const provider = serviceActor("signature-provider");
  await recordAudit({
    actor: provider,
    entity_type: "contract",
    entity_id: ctx.params.id,
    action: `contract.signer.${parsed.data.status}`,
    tenant_id: tenantId,
    metadata: { signer_email: parsed.data.email, status: r.status },
  });
  const settled = await settleContractSignature(sb, tenantId, ctx.params.id);
  if (settled.changedTo === "completed") {
    await recordAudit({ actor: provider, entity_type: "contract", entity_id: ctx.params.id, action: "contract.signature_completed", tenant_id: tenantId, metadata: { via: "all_required_signers_signed" } });
  }
  const after = await loadSignatureView(sb, tenantId, ctx.params.id);
  return NextResponse.json({ signer_status: r.status, signature: after?.view, contract_signature_status: settled.changedTo });
}

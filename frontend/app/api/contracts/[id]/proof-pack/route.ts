import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { buildProofPack } from "@/lib/delivery/pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/contracts/<id>/proof-pack: a zip of the proof accepted for the contract's delivery items, with an index. The same pack the sponsor can download. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const { data: contract } = await sb.from("contracts").select("id, contract_number, title").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const pack = await buildProofPack(sb, { tenantId: auth.user.tenant_id, contractId: ctx.params.id, contractLabel: String(contract.contract_number ?? contract.title ?? "contract") });
  if ("error" in pack) return NextResponse.json({ error: pack.error }, { status: pack.status });
  if (pack.items === 0) return NextResponse.json({ error: "No delivery item on this contract has accepted proof yet." }, { status: 409 });
  const name = `proof-pack-${String(contract.contract_number ?? "contract").replace(/[^A-Za-z0-9._-]+/g, "-")}.zip`;
  return new Response(new Uint8Array(pack.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Pack-Truncated": String(pack.truncated) } });
}

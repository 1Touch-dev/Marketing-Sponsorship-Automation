import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePortalSession } from "@/lib/portal/guard";
import { portalContracts } from "@/lib/portal/data";
import { buildProofPack } from "@/lib/delivery/pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/portal/delivery/pack/<contractId>: a zip of the proof the club accepted for this sponsor's items on one of its
 * contracts, with an index. Built from what the sponsor is shown, so it holds nothing more.
 */
export async function GET(_req: Request, ctx: { params: { contractId: string } }) {
  const sb = supabaseAdmin();
  const auth = await requirePortalSession(sb);
  if ("error" in auth) return auth.error;
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!UUID.test(ctx.params.contractId)) return notFound();
  const contracts = await portalContracts(sb, auth.ctx);
  const contract = contracts.ok ? contracts.value.find((c) => c.id === ctx.params.contractId) : undefined;
  if (!contract) return notFound();
  const pack = await buildProofPack(sb, { tenantId: auth.ctx.tenantId, companyId: auth.ctx.companyId, contractId: ctx.params.contractId, contractLabel: String(contract.contract_number ?? contract.title ?? "contract") });
  if ("error" in pack) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  if (pack.items === 0) return NextResponse.json({ error: "There is no accepted proof to put in a pack yet." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  const name = `proof-pack-${String(contract.contract_number ?? "contract").replace(/[^A-Za-z0-9._-]+/g, "-")}.zip`;
  return new Response(new Uint8Array(pack.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Pack-Truncated": String(pack.truncated) } });
}

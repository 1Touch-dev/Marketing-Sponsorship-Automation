import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listProofFiles, proofFileUrl } from "@/lib/delivery/proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A short-lived address for one proof file of this obligation. */
export async function GET(_req: Request, ctx: { params: { id: string; fileId: string } }) {
  const sb = supabaseAdmin();
  const file = (await listProofFiles(sb, await resolveTenantId(), [ctx.params.id])).get(ctx.params.id)?.find((f) => f.id === ctx.params.fileId);
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const url = await proofFileUrl(sb, file, 300);
  if (!url) return NextResponse.json({ error: "The file could not be fetched just now." }, { status: 502 });
  return NextResponse.json({ url, expires_in_seconds: 300, name: file.file_name, sha256: file.sha256 });
}

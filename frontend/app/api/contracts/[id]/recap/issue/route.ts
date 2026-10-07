import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { issueRecap } from "@/lib/recap/store";
import { refreshForContract } from "@/lib/company-status/store";

export const runtime = "nodejs";

const schema = z.object({ acknowledgement: z.string().max(2000).nullish() });

/**
 * Issue the recap as it stands: a numbered, immutable version with a checksum. A recap with gaps is issued only
 * with a written acknowledgement (10+ characters) that the gaps exist; they travel with the recap. Admin or approver.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("issue_recap");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await issueRecap(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data.acknowledgement, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const { recap: _recap, ...issued } = res.value;
  await recordAudit({
    entity_type: "contract", entity_id: ctx.params.id, action: "recap.issued", actor_email: auth.user.email, tenant_id: auth.user.tenant_id,
    metadata: { version: issued.version, status: issued.status, gaps: issued.gap_count, blocking: issued.blocking_gap_count, checksum: issued.checksum, actor_user_id: auth.user.id },
  });
  await refreshForContract(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, "recap.issued");
  return NextResponse.json(issued, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { restoreTombstone } from "@/lib/records/tombstones";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().max(500).nullish() });

/**
 * POST /api/tombstones/[id]/restore
 * Undo a deletion. Everything that one delete removed comes back, in the order it went, with the same IDs.
 * Refused if a record with one of those IDs exists again. Admin only; the restore is audited.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("restore_records");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await restoreTombstone(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, auth.user.email, parsed.data.note);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "tombstone", entity_id: ctx.params.id, action: "record.restored", metadata: { restored: res.value.restored, note: parsed.data.note ?? null } });
  return NextResponse.json(res.value);
}

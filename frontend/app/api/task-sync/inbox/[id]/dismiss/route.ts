import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { dismissInboxItem } from "@/lib/tasks/sync";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().min(5).max(500) });

/** POST /api/task-sync/inbox/<id>/dismiss   { note }: set an item aside, saying why. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say why it is being set aside (5+ characters).", issues: parsed.error.issues }, { status: 400 });
  const res = await dismissInboxItem(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, auth.user.email, parsed.data.note);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "task_sync", action: "task_sync.dismissed", metadata: { item: ctx.params.id } });
  return NextResponse.json(res.value);
}

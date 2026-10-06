import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { setRetired } from "@/lib/claims/store";

export const runtime = "nodejs";

const schema = z.object({ retired: z.boolean() });

/** A retired claim is never shown to a sponsor. Its versions and reviews stay as history. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_claim");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const res = await setRetired(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data.retired);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "claim", entity_id: ctx.params.id, action: parsed.data.retired ? "claim.retired" : "claim.restored", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { actor_user_id: auth.user.id } });
  return NextResponse.json({ retired: parsed.data.retired });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { listSenders, setSenderAuthorization } from "@/lib/contacts/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Team members and whether each is currently an authorized sender (may be named as the sender of outreach). */
export async function GET() {
  const res = await listSenders(supabaseAdmin(), await resolveTenantId());
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.value });
}

const schema = z.object({ team_member_id: z.string().uuid(), decision: z.enum(["granted", "revoked"]), reason: z.string().min(5).max(500) });

/** An admin authorizes or revokes a team member as a named sender. History is kept. */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await setSenderAuthorization(supabaseAdmin(), auth.user.tenant_id, parsed.data.team_member_id, { decision: parsed.data.decision, reason: parsed.data.reason, actorEmail: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "team_member", entity_id: parsed.data.team_member_id, action: `sender.${parsed.data.decision}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { reason: parsed.data.reason, actor_user_id: auth.user.id } });
  return NextResponse.json({ authorization_id: res.value.id }, { status: 201 });
}

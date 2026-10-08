import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { addVersion } from "@/lib/claims/store";
import { SOURCE_KINDS } from "@/lib/claims/status";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({
  value: z.string().min(1).max(300),
  unit: z.string().max(60).nullish(),
  description: z.string().max(1000).nullish(),
  source_kind: z.enum(SOURCE_KINDS),
  source_ref: z.string().max(500).nullish(),
  source_url: z.string().max(1000).nullish(),
  effective_date: z.string().nullish(),
  expires_at: z.string().nullish(),
  owner: z.string().max(200).nullish(),
});

/** A changed figure, a corrected source or a renewed expiry is a new version. It starts unreviewed. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_claim");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await addVersion(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "claim", entity_id: ctx.params.id, action: "claim.version_added", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { version: res.value.version, actor_user_id: auth.user.id } });
  return NextResponse.json({ version_id: res.value.versionId, version: res.value.version }, { status: 201 });
}

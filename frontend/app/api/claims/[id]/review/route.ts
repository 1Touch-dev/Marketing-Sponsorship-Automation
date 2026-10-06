import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordReview } from "@/lib/claims/store";

export const runtime = "nodejs";

const schema = z.object({
  version_id: z.string().uuid(),
  decision: z.enum(["verified", "disputed"]),
  note: z.string().max(1000).nullish(),
});

/** Verify or dispute the CURRENT version of a claim. A different person from the one who recorded it. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("review_claim");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await recordReview(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, {
    versionId: parsed.data.version_id,
    decision: parsed.data.decision,
    note: parsed.data.note,
    reviewerId: auth.user.id,
    reviewerEmail: auth.user.email,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "claim", entity_id: ctx.params.id, action: `claim.${parsed.data.decision}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { version_id: parsed.data.version_id, actor_user_id: auth.user.id } });
  return NextResponse.json({ review_id: res.value.reviewId }, { status: 201 });
}

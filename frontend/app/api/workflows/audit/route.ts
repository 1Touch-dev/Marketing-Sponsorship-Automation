import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

const bodySchema = z.object({
  entity_type: z.string().min(1).max(120),
  entity_id: z.string().uuid().optional().nullable(),
  action: z.string().min(1).max(200),
  performed_by: z.string().uuid().optional().nullable(),
  actor_email: z.string().email().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/workflows/audit
 * Lets n8n (or other orchestrators) append audit rows using the same path as the app.
 * When `MSA_INTERNAL_WEBHOOK_SECRET` is set in the environment, requests must include:
 *   header: x-msa-webhook-secret: <same value>
 */
export async function POST(req: Request) {
  const env = serverEnv();
  const secret = env.MSA_INTERNAL_WEBHOOK_SECRET;
  if (secret) {
    const hdr = req.headers.get("x-msa-webhook-secret");
    if (hdr !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  await recordAudit({
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id ?? undefined,
    action: parsed.data.action,
    performed_by: parsed.data.performed_by ?? undefined,
    actor_email: parsed.data.actor_email ?? undefined,
    metadata: parsed.data.metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}

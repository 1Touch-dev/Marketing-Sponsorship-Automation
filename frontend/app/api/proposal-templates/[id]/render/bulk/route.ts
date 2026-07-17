/**
 * POST /api/proposal-templates/[id]/render/bulk
 * Bulk auto-customize: render this HTML template across many companies at
 * once (e.g. "when proposals are approved for an industry and logos
 * scraped, auto customize proposals" — James, 17 July).
 * Body: { company_ids: string[] }
 * Returns immediately with a batch_id; poll GET .../render/bulk/[batchId].
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { renderTemplateForCompany } from "@/lib/presentations/render-template";
import { logger } from "@/lib/monitoring/logger";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  company_ids: z.array(z.string().uuid()).min(1).max(50),
});

const CONCURRENCY = 3;

// In-memory batch registry — bulk template renders are a best-effort,
// short-lived operation (a few minutes); template_renders.batch_id is the
// durable source of truth polled by the UI, this just tracks the initial ack.
const batchMeta = new Map<string, { templateId: string; total: number; createdAt: number }>();

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const batchId = randomUUID();
  const { company_ids } = parsed.data;
  batchMeta.set(batchId, { templateId: ctx.params.id, total: company_ids.length, createdAt: Date.now() });

  void processBulkRender(batchId, ctx.params.id, company_ids, user.id).catch((err) => {
    logger.apiError("/api/proposal-templates/render/bulk", err instanceof Error ? err : new Error(String(err)));
  });

  return NextResponse.json({ batch_id: batchId, template_id: ctx.params.id, total: company_ids.length });
}

async function processBulkRender(
  batchId: string,
  templateId: string,
  companyIds: string[],
  userId: string,
) {
  let idx = 0;
  const next = async (): Promise<void> => {
    if (idx >= companyIds.length) return;
    const companyId = companyIds[idx++];
    try {
      await renderTemplateForCompany({ templateId, companyId, batchId, createdBy: userId });
    } catch (err) {
      logger.apiError("bulk_render_one", err instanceof Error ? err : new Error(String(err)));
    }
    return next();
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, companyIds.length) }, () => next());
  await Promise.all(workers);
}

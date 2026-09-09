/**
 * POST /api/agents/outreach/batch
 * Launches the Outreach Agent across a list of companies for a single
 * pre-approved campaign ("auto-run mode"). Each company gets its own
 * agent_runs row (linked via batch_id); the campaign must have
 * `is_preapproved = true` or auto-run is refused (safety: prevents
 * accidentally mass-generating + auto-approving proposals for a campaign
 * nobody signed off on).
 *
 * Runs are processed with bounded concurrency in the background — this
 * route returns immediately with the batch id so the UI can poll status.
 *
 * Body: { campaign_id: string, company_ids: string[], mode?: "auto" | "supervised" }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { runAgentOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMode, SSEEvent } from "@/lib/agents/types";
import { logger } from "@/lib/monitoring/logger";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  campaign_id: z.string().uuid(),
  company_ids: z.array(z.string().uuid()).min(1).max(50),
  mode: z.enum(["auto", "supervised"]).optional(),
});

const CONCURRENCY = 3;

function extractDomain(website: string): string {
  if (!website) return "";
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

export async function POST(req: Request) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;
  // agent_batch_runs.created_by references auth.users(id), not
  // platform_users.id (requirePermission()'s identity) — fetch separately.
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { campaign_id, company_ids, mode } = parsed.data;
  const sb = supabaseAdmin();

  const { data: campaign } = await sb
    .from("campaigns")
    .select("id, title, is_preapproved")
    .eq("id", campaign_id)
    .maybeSingle();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.is_preapproved) {
    return NextResponse.json(
      { error: "Campaign is not pre-approved. Mark it as pre-approved before running the batch agent." },
      { status: 409 }
    );
  }

  const { data: companies } = await sb
    .from("companies")
    .select("id, company_name, website")
    .in("id", company_ids);

  const validCompanies = (companies ?? []).filter((c) => extractDomain(c.website ?? ""));
  if (validCompanies.length === 0) {
    return NextResponse.json({ error: "None of the selected companies have a usable website/domain" }, { status: 400 });
  }

  const batchMode: AgentMode = mode ?? "auto";

  const { data: batch, error: batchErr } = await sb
    .from("agent_batch_runs" as "companies")
    .insert({
      campaign_id,
      created_by: user.id,
      mode: batchMode,
      company_ids: validCompanies.map((c) => c.id),
      total_count: validCompanies.length,
      queued_count: validCompanies.length,
      status: "running",
    } as unknown as Record<string, unknown>)
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (batchErr || !batch) {
    return NextResponse.json({ error: batchErr?.message ?? "Failed to create batch" }, { status: 500 });
  }

  const batchId = batch.id;

  // Fire-and-forget: process the queue with bounded concurrency. The client
  // polls GET /api/agents/outreach/batch/[batchId] for progress.
  void processBatch(batchId, campaign_id, validCompanies, batchMode, user.id).catch((err) => {
    logger.apiError("/api/agents/outreach/batch", err instanceof Error ? err : new Error(String(err)));
  });

  return NextResponse.json({
    batch_id: batchId,
    campaign_id,
    total: validCompanies.length,
    skipped: company_ids.length - validCompanies.length,
    mode: batchMode,
  });
}

async function processBatch(
  batchId: string,
  campaignId: string,
  companies: Array<{ id: string; company_name: string; website: string | null }>,
  mode: AgentMode,
  userId: string
) {
  const sb = supabaseAdmin();
  let running = 0;
  let doneCount = 0;
  let failedCount = 0;
  let idx = 0;

  const updateCounts = async (extra?: Record<string, unknown>) => {
    await sb.from("agent_batch_runs" as "companies").update({
      running_count: running,
      done_count: doneCount,
      failed_count: failedCount,
      queued_count: companies.length - running - doneCount - failedCount,
      ...(extra ?? {}),
    } as unknown as Record<string, unknown>).eq("id", batchId).then(() => {});
  };

  const runOne = async (company: { id: string; company_name: string; website: string | null }) => {
    running++;
    await updateCounts();

    const domain = extractDomain(company.website ?? "");
    const { data: existingRun } = await sb
      .from("agent_runs" as "companies")
      .select("id, status")
      .eq("company_id", company.id)
      .in("status", ["running", "paused_for_approval", "paused_for_proposal_approval"])
      .limit(1)
      .maybeSingle() as unknown as { data: { id: string; status: string } | null };

    if (existingRun) {
      // Record a visible failed row for this batch instead of silently
      // dropping the company — otherwise it just vanishes from the UI with
      // no explanation of why it never ran.
      await sb.from("agent_runs" as "companies").insert({
        company_id: company.id,
        created_by: userId,
        status: "failed",
        mode,
        steps: [],
        batch_id: batchId,
        error: `Skipped — company already has an in-progress agent run (id: ${existingRun.id}, status: ${existingRun.status}). Resolve or wait for it to finish, then retry.`,
      } as unknown as Record<string, unknown>);
      failedCount++;
      running--;
      await updateCounts();
      return;
    }

    const { data: run } = await sb
      .from("agent_runs" as "companies")
      .insert({
        company_id: company.id,
        created_by: userId,
        status: "running",
        mode,
        steps: [],
        batch_id: batchId,
      } as unknown as Record<string, unknown>)
      .select("id")
      .single() as unknown as { data: { id: string } | null };

    if (!run) {
      failedCount++;
      running--;
      await updateCounts();
      return;
    }

    const noop = (_event: SSEEvent) => {};

    try {
      await runAgentOrchestrator(
        {
          run_id: run.id,
          company_id: company.id,
          company_name: company.company_name,
          domain,
          mode,
          created_by: userId,
          auto_approve: mode === "auto",
          batch_id: batchId,
        },
        noop
      );
      doneCount++;
    } catch (err) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      await sb.from("agent_runs" as "companies")
        .update({ status: "failed", error: msg, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
        .eq("id", run.id);
      logger.apiError("agent_batch_run_one", err instanceof Error ? err : new Error(msg));
    } finally {
      running--;
      await updateCounts();
    }
  };

  const workers: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    if (idx >= companies.length) return;
    const company = companies[idx++];
    await runOne(company);
    return next();
  };

  for (let w = 0; w < Math.min(CONCURRENCY, companies.length); w++) {
    workers.push(next());
  }
  await Promise.all(workers);

  await sb.from("agent_batch_runs" as "companies").update({
    status: failedCount === companies.length ? "failed" : "completed",
    running_count: 0,
    queued_count: 0,
    done_count: doneCount,
    failed_count: failedCount,
    updated_at: new Date().toISOString(),
  } as unknown as Record<string, unknown>).eq("id", batchId);

  logger.info("Agent batch run completed", { batchId, campaignId, doneCount, failedCount, total: companies.length });
}

/**
 * POST /api/mail/sync-replies
 *
 * Polls patrocinios@ Inbox via Microsoft Graph and ingests replies to
 * platform-sent outreach. Intended for n8n/cron every 5 minutes with
 * INTERNAL_API_SECRET, or a staff session with manage_integrations.
 */
import { NextResponse } from "next/server";
import { requireCaller } from "@/lib/auth/server-permission";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncMailboxReplies } from "@/lib/mail/reply-sync";
import { GraphNotConfiguredError, graphConfigured, graphMailbox } from "@/lib/mail/ms-graph";
import { logger } from "@/lib/monitoring/logger";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const caller = await requireCaller(req, "manage_integrations");
  if ("error" in caller) return caller.error;

  if (!graphConfigured()) {
    return NextResponse.json(
      { error: new GraphNotConfiguredError().message },
      { status: 503 },
    );
  }

  try {
    const counts = await syncMailboxReplies(supabaseAdmin(), caller.tenantId, {
      actor: caller.actor,
      mailbox: graphMailbox(),
    });
    return NextResponse.json({
      ok: true,
      mailbox: graphMailbox(),
      ...counts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.apiError("/api/mail/sync-replies", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

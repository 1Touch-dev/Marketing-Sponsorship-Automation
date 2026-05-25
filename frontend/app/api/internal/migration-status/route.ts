import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/migration-status
 *
 * Performs live database column + table probes to determine whether
 * migrations 0005 and 0006 have been applied.
 *
 * Migration 0005 — updated_at on remaining tables:
 *   - proposal_versions.updated_at
 *   - approvals.updated_at
 *   - audit_logs.updated_at
 *   (triggers are inferred: the migration adds columns + triggers atomically)
 *
 * Migration 0006 — Phase 1 hardening:
 *   - workflow_events table (whole table)
 *   - campaigns.prompt_version
 *   - proposals.prompt_version  + proposals.status_reason
 *   - emails.prompt_version     + emails.status_reason
 *   - followups.status_reason
 *
 * Each check does a SELECT of only the new column(s) with limit=1.
 * A 200 response means the column/table exists; any error means it doesn't.
 * This is safe, read-only, and works with the service-role key.
 */
export async function GET(req: Request) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;
  const sb = supabaseAdmin();

  // Helper: returns true if the select succeeds (column/table exists)
  async function colExists(
    table: string,
    cols: string,
  ): Promise<boolean> {
    const { error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from(table as "audit_logs") // cast to satisfy TS — table is dynamic
      .select(cols)
      .limit(1);
    return !error;
  }

  // ── Migration 0005 checks ──────────────────────────────────────────────────
  const [pv_updated_at, approvals_updated_at, audit_logs_updated_at] =
    await Promise.all([
      colExists("proposal_versions", "id, updated_at"),
      colExists("approvals", "id, updated_at"),
      colExists("audit_logs", "id, updated_at"),
    ]);

  const migration0005: MigrationCheck = {
    applied: pv_updated_at && approvals_updated_at && audit_logs_updated_at,
    checks: {
      "proposal_versions.updated_at": pv_updated_at,
      "approvals.updated_at": approvals_updated_at,
      "audit_logs.updated_at": audit_logs_updated_at,
      // Triggers cannot be probed via PostgREST (information_schema is not exposed).
      // They are created in the same transaction as the columns, so column presence
      // is a reliable proxy for trigger presence.
      "trg_proposal_versions_updated_at": pv_updated_at,
      "trg_approvals_updated_at": approvals_updated_at,
      "trg_audit_logs_updated_at": audit_logs_updated_at,
    },
  };

  // ── Migration 0006 checks ──────────────────────────────────────────────────
  const [
    workflow_events_table,
    campaigns_prompt_version,
    proposals_prompt_version,
    proposals_status_reason,
    emails_prompt_version,
    emails_status_reason,
    followups_status_reason,
  ] = await Promise.all([
    colExists("workflow_events", "id"),
    colExists("campaigns", "id, prompt_version"),
    colExists("proposals", "id, prompt_version"),
    colExists("proposals", "id, status_reason"),
    colExists("emails", "id, prompt_version"),
    colExists("emails", "id, status_reason"),
    colExists("followups", "id, status_reason"),
  ]);

  const migration0006: MigrationCheck = {
    applied:
      workflow_events_table &&
      campaigns_prompt_version &&
      proposals_prompt_version &&
      proposals_status_reason &&
      emails_prompt_version &&
      emails_status_reason &&
      followups_status_reason,
    checks: {
      "workflow_events (table)": workflow_events_table,
      "campaigns.prompt_version": campaigns_prompt_version,
      "proposals.prompt_version": proposals_prompt_version,
      "proposals.status_reason": proposals_status_reason,
      "emails.prompt_version": emails_prompt_version,
      "emails.status_reason": emails_status_reason,
      "followups.status_reason": followups_status_reason,
    },
  };

  return NextResponse.json({
    migrations: {
      "0005": migration0005,
      "0006": migration0006,
    },
    all_applied: migration0005.applied && migration0006.applied,
  });
}

interface MigrationCheck {
  applied: boolean;
  checks: Record<string, boolean>;
}

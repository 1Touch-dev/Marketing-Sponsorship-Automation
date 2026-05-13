import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// ── Migration check helpers ────────────────────────────────────────────────
// Each helper does a focused SELECT of only the new column(s).
// 200 → column/table exists; any PostgREST error → not yet applied.

async function colExists(
  sb: ReturnType<typeof supabaseAdmin>,
  table: string,
  cols: string,
): Promise<boolean> {
  const { error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from(table as "audit_logs") // cast — table is dynamic at runtime
    .select(cols)
    .limit(1);
  return !error;
}

async function checkMigration0005(sb: ReturnType<typeof supabaseAdmin>) {
  // 0005 adds updated_at to proposal_versions, approvals, and audit_logs.
  // None of these columns exist in the 0001 init schema, so their presence
  // is the definitive proof that 0005 was applied.
  const [pvOk, approvalsOk, auditOk] = await Promise.all([
    colExists(sb, "proposal_versions", "id, updated_at"),
    colExists(sb, "approvals", "id, updated_at"),
    colExists(sb, "audit_logs", "id, updated_at"),
  ]);
  return {
    applied: pvOk && approvalsOk && auditOk,
    details: {
      "proposal_versions.updated_at": pvOk,
      "approvals.updated_at": approvalsOk,
      "audit_logs.updated_at": auditOk,
    },
  };
}

async function checkMigration0006(sb: ReturnType<typeof supabaseAdmin>) {
  // 0006 adds:
  //   • workflow_events table (entirely new)
  //   • prompt_version on campaigns, proposals, emails
  //   • status_reason on proposals, emails, followups
  const [weOk, cpv, ppv, psr, epv, esr, fsr] = await Promise.all([
    colExists(sb, "workflow_events", "id"),
    colExists(sb, "campaigns", "id, prompt_version"),
    colExists(sb, "proposals", "id, prompt_version"),
    colExists(sb, "proposals", "id, status_reason"),
    colExists(sb, "emails", "id, prompt_version"),
    colExists(sb, "emails", "id, status_reason"),
    colExists(sb, "followups", "id, status_reason"),
  ]);
  return {
    applied: weOk && cpv && ppv && psr && epv && esr && fsr,
    details: {
      "workflow_events (table)": weOk,
      "campaigns.prompt_version": cpv,
      "proposals.prompt_version": ppv,
      "proposals.status_reason": psr,
      "emails.prompt_version": epv,
      "emails.status_reason": esr,
      "followups.status_reason": fsr,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { gmail?: string };
}) {
  const sb = supabaseAdmin();

  // Gmail token check
  const senderEmail = process.env.DEFAULT_FROM_EMAIL ?? "";
  const { data: user } = senderEmail
    ? await sb.from("users").select("email, metadata, role").eq("email", senderEmail).maybeSingle()
    : { data: null };
  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { refresh_token?: string }
    | undefined;
  const gmailConnected = !!tokens?.refresh_token;

  // Migration checks — run all in parallel
  const [m0005, m0006] = await Promise.all([
    checkMigration0005(sb),
    checkMigration0006(sb),
  ]);

  const allMigrationsApplied = m0005.applied && m0006.applied;

  return (
    <>
      <PageHeader title="Settings" description="Configure integrations and platform options." />

      {searchParams.gmail === "connected" ? (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Gmail connected successfully.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Gmail ── */}
        <Card>
          <CardHeader>
            <CardTitle>Gmail integration</CardTitle>
            <CardDescription>OAuth connection for drafting &amp; sending outreach emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span>Status:</span>
              {gmailConnected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            {senderEmail ? (
              <div className="text-muted-foreground">Sender: {senderEmail}</div>
            ) : null}
            <Button asChild>
              <a href="/api/auth/gmail">{gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Scopes: gmail.compose, gmail.send, gmail.readonly, gmail.modify.
            </p>
            {/* Remind the operator which redirect URI must be registered in Google Cloud */}
            {!gmailConnected && (
              <div className="rounded border border-sky-200 bg-sky-50 p-3 space-y-1.5 text-xs text-sky-800">
                <p className="font-medium">Pre-requisite: Google Cloud Console setup</p>
                <p>
                  The following URI must be added to your OAuth 2.0 client under
                  &quot;Authorised redirect URIs&quot;:
                </p>
                <code className="block font-mono bg-white border border-sky-200 rounded px-2 py-1 break-all select-all">
                  {process.env.GOOGLE_REDIRECT_URI ??
                    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`}
                </code>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-block"
                >
                  Open Google Cloud Console → Credentials
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── AI / Env ── */}
        <Card>
          <CardHeader>
            <CardTitle>AI &amp; environment</CardTitle>
            <CardDescription>Server-side configuration (read-only).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Bedrock model" v={process.env.BEDROCK_MODEL_ID ?? "—"} />
            <Row k="AWS region" v={process.env.AWS_REGION ?? "—"} />
            <Row k="Default ideas / generation" v={process.env.MAX_CAMPAIGN_IDEAS ?? "5"} />
            <Row k="Follow-up delay (days)" v={process.env.FOLLOWUP_DELAY_DAYS ?? "3"} />
          </CardContent>
        </Card>

        {/* ── Migration status ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Database migration status</CardTitle>
            <CardDescription>
              Live checks against the database — refreshes on every page load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* 0005 */}
            <MigrationRow
              label="Migration 0005 — updated_at triggers on remaining tables"
              applied={m0005.applied}
              details={m0005.details}
            />

            {/* 0006 */}
            <MigrationRow
              label="Migration 0006 — workflow_events table, prompt_version, status_reason"
              applied={m0006.applied}
              details={m0006.details}
            />

            {/* Action block — only shown when something is still pending */}
            {!allMigrationsApplied && (
              <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="font-medium text-amber-900">Action required: apply pending migrations</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-800">
                  <li>
                    Open the{" "}
                    <a
                      href="https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Supabase Dashboard → SQL Editor
                    </a>
                  </li>
                  <li>
                    Paste the SQL from{" "}
                    <code className="font-mono bg-amber-100 px-1 rounded">/api/internal/apply-migration</code>
                  </li>
                  <li>Click &quot;Run&quot;</li>
                  <li>Refresh this page — badges will turn green automatically</li>
                </ol>
                <div className="flex gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <a href="/api/internal/apply-migration" target="_blank">
                      View migration SQL
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="/api/internal/migration-status" target="_blank">
                      View detailed check results
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {allMigrationsApplied && (
              <p className="text-emerald-700 font-medium">
                ✓ All migrations applied — database schema is fully up to date.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

function MigrationRow({
  label,
  applied,
  details,
}: {
  label: string;
  applied: boolean;
  details: Record<string, boolean>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}</span>
        {applied ? (
          <Badge variant="success">Applied</Badge>
        ) : (
          <Badge variant="outline" className="text-amber-700 border-amber-300">
            Pending
          </Badge>
        )}
      </div>
      <ul className="ml-3 space-y-0.5 text-xs text-muted-foreground">
        {Object.entries(details).map(([check, ok]) => (
          <li key={check} className="flex items-center gap-1.5">
            <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "✗"}</span>
            <span>{check}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

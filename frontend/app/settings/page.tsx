import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PROMPT_VERSION } from "@/lib/bedrock/prompts";
import {
  Shield, Trophy, XCircle, CheckCircle2, Zap,
  FileText, Users, DollarSign, Image, Brain,
  Mail, ChevronRight,
} from "lucide-react";

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
  // 0006 adds workflow_events table, prompt_version, and status_reason columns.
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

// ── Gmail token type ────────────────────────────────────────────────────────
interface GmailTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
  connected_email?: string | null;
  connected_at?: string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { gmail?: string; reason?: string };
}) {
  const sb = supabaseAdmin();

  // ── Gmail token check ─────────────────────────────────────────────────────
  // We check via two strategies:
  // 1. By DEFAULT_FROM_EMAIL (legacy: tokens stored on the configured sender row)
  // 2. By connected_email stored inside the token payload (new: tokens stored on
  //    the row of the actual authorized account)
  // Either is enough to consider Gmail connected.
  const configuredSender = process.env.DEFAULT_FROM_EMAIL ?? "";

  // Fetch rows that could hold the tokens
  const senderQuery = configuredSender
    ? sb.from("users").select("id, email, metadata").eq("email", configuredSender).maybeSingle()
    : Promise.resolve({ data: null });

  const { data: senderUser } = await senderQuery;

  const tokens = (senderUser?.metadata as Record<string, unknown> | undefined)
    ?.gmail_tokens as GmailTokens | undefined;

  // Connected = has both access_token and refresh_token stored
  const gmailConnected = !!(tokens?.access_token && tokens?.refresh_token);
  const connectedEmail = tokens?.connected_email ?? (gmailConnected ? configuredSender : null);
  const expiresAt = tokens?.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : null;

  // Mismatch warning — connected account differs from configured sender
  const senderMismatch =
    gmailConnected && connectedEmail && configuredSender && connectedEmail !== configuredSender;

  // Migration checks — run all in parallel
  const [m0005, m0006] = await Promise.all([checkMigration0005(sb), checkMigration0006(sb)]);

  const allMigrationsApplied = m0005.applied && m0006.applied;

  // Prompt version stats — count proposals/campaigns using current vs old prompts
  const [{ count: totalProposals }, { count: v3Proposals }, { count: totalCampaigns }, { count: v3Campaigns }] =
    await Promise.all([
      sb.from("proposals").select("*", { count: "exact", head: true }),
      sb.from("proposals").select("*", { count: "exact", head: true }).eq("prompt_version", PROMPT_VERSION),
      sb.from("campaigns").select("*", { count: "exact", head: true }),
      sb.from("campaigns").select("*", { count: "exact", head: true }).eq("prompt_version", PROMPT_VERSION),
    ]);

  return (
    <>
      <PageHeader title="Settings" description="Configure integrations and platform options." />

      {searchParams.gmail === "connected" ? (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Gmail connected successfully.
        </div>
      ) : null}
      {searchParams.gmail === "error" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Gmail connection failed
          {searchParams.reason ? `: ${searchParams.reason.replace(/_/g, " ")}` : ""}. Please try
          again.
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

            {/* Connected account details */}
            {gmailConnected && connectedEmail ? (
              <div className="space-y-1">
                <div className="text-muted-foreground">
                  Connected as: <span className="font-medium text-foreground">{connectedEmail}</span>
                </div>
                {configuredSender && (
                  <div className="text-muted-foreground">Configured sender: {configuredSender}</div>
                )}
                {expiresAt && (
                  <div className="text-xs text-muted-foreground">Token expires: {expiresAt}</div>
                )}
              </div>
            ) : configuredSender ? (
              <div className="text-muted-foreground">Sender: {configuredSender}</div>
            ) : null}

            {/* Account mismatch warning */}
            {senderMismatch && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                ⚠ Connected account ({connectedEmail}) differs from configured sender (
                {configuredSender}). Emails will be sent from {connectedEmail}.
              </div>
            )}

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

        {/* ── AI Prompt Configuration ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  AI Prompt Configuration — Coritiba FC
                </CardTitle>
                <CardDescription>
                  Active prompt rules, Coritiba FC enforcement, competitor exclusions, and generation functions.
                </CardDescription>
              </div>
              <Badge variant="success" className="flex-shrink-0 font-mono text-xs">
                {PROMPT_VERSION}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">

            {/* Prompt version stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xl font-bold">{totalProposals ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total proposals</div>
              </div>
              <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <div className="text-xl font-bold text-green-700 dark:text-green-300">{v3Proposals ?? 0}</div>
                <div className="text-xs text-muted-foreground">Using {PROMPT_VERSION}</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xl font-bold">{totalCampaigns ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total campaigns</div>
              </div>
              <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <div className="text-xl font-bold text-green-700 dark:text-green-300">{v3Campaigns ?? 0}</div>
                <div className="text-xs text-muted-foreground">Using {PROMPT_VERSION}</div>
              </div>
            </div>

            {/* Coritiba FC grounding */}
            <div>
              <div className="flex items-center gap-2 font-semibold mb-3">
                <Trophy className="h-4 w-4 text-green-600" />
                Coritiba FC Grounding — active in all prompts
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: "Club", value: "Coritiba Foot Ball Club (Coxa / Coxa-Branca)" },
                  { label: "Founded", value: "1909 — one of Brazil's oldest clubs" },
                  { label: "Stadium", value: "Couto Pereira (Estádio Major Antônio Couto Pereira), Curitiba, PR" },
                  { label: "Colors", value: "Verde e Branco — Green & White" },
                  { label: "Fan identity", value: "Coxa-Branca supporters — Curitiba/Paraná" },
                  { label: "Digital reach", value: "1.5M+ social followers" },
                  { label: "Broadcast", value: "Globo / SporTV / Paramount+ / Paraná TV" },
                  { label: "Competitions", value: "Brasileirão Série A/B, Copa do Brasil, Camp. Paranaense" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-900/20 p-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium">{label}:</span>{" "}
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sponsor inventory */}
            <div>
              <div className="flex items-center gap-2 font-semibold mb-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Coritiba FC Sponsor Inventory (in prompt context)
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Jersey front / sleeve / back",
                  "Couto Pereira LED boards",
                  "Stadium scoreboard naming",
                  "Matchday PA announcements",
                  "Club website & app",
                  "Instagram / YouTube / TikTok",
                  "Training & warmup kit",
                  "Press conference backdrop",
                  "Youth academy co-branding",
                  "Women's team sponsorship",
                  "Fan club materials",
                  "Pre/post-match broadcast segments",
                ].map((item) => (
                  <span key={item} className="text-xs bg-muted border px-2 py-1 rounded-full">{item}</span>
                ))}
              </div>
            </div>

            {/* Competitor exclusions */}
            <div>
              <div className="flex items-center gap-2 font-semibold mb-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Competitor Exclusions — forbidden in all AI outputs
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { name: "Athletico Paranaense", reason: "Direct Curitiba rival (CAP / Furacão)" },
                  { name: "Corinthians", reason: "São Paulo club" },
                  { name: "São Paulo FC", reason: "São Paulo club" },
                  { name: "Flamengo", reason: "Rio de Janeiro club" },
                  { name: "Palmeiras", reason: "São Paulo club" },
                  { name: "Grêmio / Internacional", reason: "Porto Alegre clubs" },
                ].map(({ name, reason }) => (
                  <div key={name} className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 p-2">
                    <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs">{name}</div>
                      <div className="text-xs text-muted-foreground">{reason}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                External campaigns (Red Bull, Nike, etc.) may only be used as internal strategic inspiration — never recommended as alternative sponsorship targets.
              </p>
            </div>

            {/* Prompt functions */}
            <div>
              <div className="flex items-center gap-2 font-semibold mb-3">
                <Brain className="h-4 w-4 text-purple-500" />
                Active Prompt Functions ({PROMPT_VERSION})
              </div>
              <div className="space-y-2">
                {[
                  { fn: "campaignIdeasPrompt()", icon: Zap, color: "text-amber-500", desc: "Generates Coritiba FC sponsorship campaign ideas — different archetypes per call, Couto Pereira references required." },
                  { fn: "strategyVariantsPrompt()", icon: Users, color: "text-blue-500", desc: "Generates 3 distinct Coritiba FC strategy variants (awareness, fan engagement, community, etc.) for a campaign." },
                  { fn: "proposalPrompt()", icon: FileText, color: "text-green-500", desc: "Writes full sponsorship proposal — must reference Coritiba FC, Couto Pereira, Verde e Branco. No competitors." },
                  { fn: "pricingTiersPrompt()", icon: DollarSign, color: "text-emerald-500", desc: "Generates 3 Coritiba FC pricing tiers (Parceiro / Master / Diamante) with specific Couto Pereira inventory." },
                  { fn: "visualPromptsPrompt()", icon: Image, color: "text-pink-500", desc: "Creates 5 Coritiba FC visual mockup prompts — jersey green/white, Couto Pereira LED boards, social templates." },
                  { fn: "companyIntelligencePrompt()", icon: Brain, color: "text-purple-500", desc: "Analyses sponsor fit for Coritiba FC / Curitiba market. Always frames recommendations around Coritiba." },
                  { fn: "outreachEmailPrompt()", icon: Mail, color: "text-sky-500", desc: "Writes B2B outreach emails from Coritiba FC's commercial department perspective." },
                  { fn: "followupEmailPrompt()", icon: Mail, color: "text-indigo-500", desc: "Polite follow-up emails — represents Coritiba FC commercial team." },
                ].map(({ fn, icon: Icon, color, desc }) => (
                  <div key={fn} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                    <Icon className={`h-4 w-4 ${color} mt-0.5 flex-shrink-0`} />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold">{fn}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source link */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Prompt source: <code className="font-mono">frontend/lib/bedrock/prompts.ts</code> —
                all rules are code-enforced and cannot be bypassed from the UI.
                Prompt version is stamped on every generated proposal and campaign.
              </span>
            </div>
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
            <MigrationRow
              label="Migration 0005 — updated_at triggers on remaining tables"
              applied={m0005.applied}
              details={m0005.details}
            />
            <MigrationRow
              label="Migration 0006 — workflow_events table, prompt_version, status_reason"
              applied={m0006.applied}
              details={m0006.details}
            />

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

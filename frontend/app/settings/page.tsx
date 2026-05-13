import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: { gmail?: string } }) {
  const sb = supabaseAdmin();
  const senderEmail = process.env.DEFAULT_FROM_EMAIL ?? "";
  const { data: user } = senderEmail
    ? await sb.from("users").select("email, metadata, role").eq("email", senderEmail).maybeSingle()
    : { data: null };

  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { refresh_token?: string }
    | undefined;
  const gmailConnected = !!tokens?.refresh_token;

  // Check migration status
  const { error: weErr } = await sb.from("workflow_events").select("id").limit(1);
  const migration0006Applied = !weErr;
  const { data: sampleCampaign } = await sb.from("campaigns").select("id, prompt_version").limit(1).maybeSingle();
  const migration0006Columns = sampleCampaign !== null && "prompt_version" in (sampleCampaign ?? {});

  return (
    <>
      <PageHeader title="Settings" description="Configure integrations and platform options." />
      {searchParams.gmail === "connected" ? (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Gmail connected successfully.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Gmail integration</CardTitle>
            <CardDescription>OAuth connection for drafting & sending outreach emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span>Status:</span>
              {gmailConnected ? <Badge variant="success">Connected</Badge> : <Badge variant="outline">Not connected</Badge>}
            </div>
            {senderEmail ? <div className="text-muted-foreground">Sender: {senderEmail}</div> : null}
            <Button asChild>
              <a href="/api/auth/gmail">{gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Scopes: gmail.compose, gmail.send, gmail.readonly, gmail.modify.
            </p>
          </CardContent>
        </Card>

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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Database migration status</CardTitle>
            <CardDescription>Pending schema migrations must be applied via the Supabase Dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span>Migration 0005 (updated_at triggers):</span>
              <Badge variant="outline" className="text-amber-700 border-amber-300">Pending</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span>Migration 0006 (workflow_events, prompt_version, status_reason):</span>
              {migration0006Applied && migration0006Columns
                ? <Badge variant="success">Applied</Badge>
                : <Badge variant="outline" className="text-amber-700 border-amber-300">Pending</Badge>}
            </div>
            {(!migration0006Applied || !migration0006Columns) && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="font-medium text-amber-900">Action required: Apply pending migrations</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-800">
                  <li>Go to <a href="https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard → SQL Editor</a></li>
                  <li>Copy and paste the SQL from <code className="font-mono bg-amber-100 px-1">/api/internal/apply-migration</code></li>
                  <li>Click &quot;Run&quot; to apply the migrations</li>
                  <li>Refresh this page to verify</li>
                </ol>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <a href="/api/internal/apply-migration" target="_blank">View migration SQL</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}

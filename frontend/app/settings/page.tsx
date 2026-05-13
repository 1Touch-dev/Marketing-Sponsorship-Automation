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

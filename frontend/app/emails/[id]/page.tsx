import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReplyClassificationBadge } from "@/components/shared/reply-classification-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { EmailActions } from "./email-actions";
import type { EmailRow } from "@/types/database";

export const dynamic = "force-dynamic";

type EmailWithRelations = EmailRow & {
  proposals: { id: string; title: string } | null;
  email_threads: { id: string; gmail_thread_id: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

type InboundChild = {
  id: string;
  subject: string;
  sender: string | null;
  status: string;
  status_reason: string | null;
  reply_classification: string | null;
  created_at: string;
  body_text: string | null;
  metadata: Record<string, unknown> | null;
};

export default async function EmailDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data: email } = await sb
    .from("emails")
    .select("*, proposals(id, title), email_threads(id, gmail_thread_id)")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!email) notFound();

  const typedEmail = email as unknown as EmailWithRelations;

  // Phase B: inbound replies linked via metadata.parent_email_id (Graph sync).
  let inboundReplies: InboundChild[] = [];
  if (typedEmail.direction === "outbound") {
    const { data: children } = await sb
      .from("emails")
      .select("id, subject, sender, status, status_reason, reply_classification, created_at, body_text, metadata")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .contains("metadata", { parent_email_id: params.id })
      .order("created_at", { ascending: true });
    inboundReplies = (children ?? []) as InboundChild[];
  }

  const meta = typedEmail.metadata ?? {};
  const needsReview = meta.needs_review === true || typedEmail.status_reason === "Needs review";

  return (
    <>
      <PageHeader
        title={typedEmail.subject}
        description={`To ${typedEmail.recipient}${typedEmail.sender ? ` · from ${typedEmail.sender}` : ""} · last updated ${formatDate(typedEmail.updated_at)}`}
        actions={
          <div className="flex items-center gap-2">
            {needsReview ? <Badge variant="warning">Needs review</Badge> : null}
            {typedEmail.reply_classification === "out_of_office" ? (
              <Badge variant="secondary">Out of office</Badge>
            ) : null}
            <StatusBadge status={typedEmail.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Email body</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{typedEmail.body_text}</div>
            {typedEmail.body_html ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">View HTML</summary>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">{typedEmail.body_html}</pre>
              </details>
            ) : null}
            {typedEmail.status === "sending" &&
            typedEmail.status_reason &&
            /send unconfirmed/i.test(typedEmail.status_reason) ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1">
                <p className="font-semibold">
                  Send unconfirmed — check SES / message events before retrying
                </p>
                <p className="text-amber-800/90 text-xs">Status reason: {typedEmail.status_reason}</p>
              </div>
            ) : typedEmail.status_reason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Status reason: {typedEmail.status_reason}
              </div>
            ) : null}
            {typedEmail.prompt_version ? (
              <div className="text-xs text-muted-foreground border-t pt-2">
                Prompt version: <span className="font-mono">{typedEmail.prompt_version}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <EmailActions email={typedEmail} />
          {typedEmail.reply_classification ? (
            <Card>
              <CardHeader>
                <CardTitle>Reply classification</CardTitle>
                <CardDescription>AI-assessed intent of the sponsor reply.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ReplyClassificationBadge classification={typedEmail.reply_classification} />
                {typedEmail.reply_summary ? <p className="text-muted-foreground">{typedEmail.reply_summary}</p> : null}
                {typedEmail.reply_classification_confidence !== null ? (
                  <p className="text-xs text-muted-foreground">
                    Confidence: {Math.round((typedEmail.reply_classification_confidence ?? 0) * 100)}%
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Linked proposal</CardTitle>
              <CardDescription>Originating proposal.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {typedEmail.proposals ? (
                <Link href={`/proposals/${typedEmail.proposals.id}`} className="hover:underline">
                  {typedEmail.proposals.title}
                </Link>
              ) : (
                <span className="text-muted-foreground">No proposal linked.</span>
              )}
            </CardContent>
          </Card>
          {typedEmail.email_threads?.gmail_thread_id ? (
            <Card>
              <CardHeader><CardTitle>Gmail thread</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <Link className="hover:underline" href={`/threads/${typedEmail.email_threads.id}`}>
                  View thread →
                </Link>
                <div className="text-xs text-muted-foreground mt-1 break-all">
                  Gmail thread id: {typedEmail.email_threads.gmail_thread_id}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {typedEmail.direction === "outbound" ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Inbound replies</CardTitle>
            <CardDescription>
              Matched from Microsoft 365 patrocinios@ (hard match or soft match awaiting review).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inboundReplies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No replies ingested yet.</p>
            ) : (
              inboundReplies.map((r) => {
                const rMeta = r.metadata ?? {};
                const soft = rMeta.match_method === "soft" || rMeta.needs_review === true;
                return (
                  <div key={r.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/emails/${r.id}`} className="font-medium hover:underline">
                        {r.subject}
                      </Link>
                      <StatusBadge status={r.status} />
                      {soft ? <Badge variant="warning">Needs review</Badge> : null}
                      {r.reply_classification === "out_of_office" ? (
                        <Badge variant="secondary">Out of office</Badge>
                      ) : (
                        <ReplyClassificationBadge classification={r.reply_classification} />
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">From {r.sender ?? "unknown"}</p>
                    {r.body_text ? (
                      <p className="text-sm whitespace-pre-wrap line-clamp-4">{r.body_text}</p>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

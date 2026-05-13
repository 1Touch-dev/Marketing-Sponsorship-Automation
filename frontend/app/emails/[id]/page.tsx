import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { EmailActions } from "./email-actions";
import type { EmailRow } from "@/types/database";

export const dynamic = "force-dynamic";

type EmailWithRelations = EmailRow & {
  proposals: { id: string; title: string } | null;
  email_threads: { id: string; gmail_thread_id: string | null } | null;
};

export default async function EmailDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: email } = await sb
    .from("emails")
    .select("*, proposals(id, title), email_threads(id, gmail_thread_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!email) notFound();

  const typedEmail = email as unknown as EmailWithRelations;

  return (
    <>
      <PageHeader
        title={typedEmail.subject}
        description={`To ${typedEmail.recipient}${typedEmail.sender ? ` · from ${typedEmail.sender}` : ""} · last updated ${formatDate(typedEmail.updated_at)}`}
        actions={<StatusBadge status={typedEmail.status} />}
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
            {typedEmail.status_reason ? (
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
    </>
  );
}

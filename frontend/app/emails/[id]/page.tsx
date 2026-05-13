import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { EmailActions } from "./email-actions";

export const dynamic = "force-dynamic";

export default async function EmailDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: email } = await sb
    .from("emails")
    .select("*, proposals(id, title), email_threads(id, gmail_thread_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!email) notFound();

  return (
    <>
      <PageHeader
        title={email.subject}
        description={`To ${email.recipient}${email.sender ? ` · from ${email.sender}` : ""} · last updated ${formatDate(email.updated_at)}`}
        actions={<StatusBadge status={email.status} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Email body</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{email.body_text}</div>
            {email.body_html ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">View HTML</summary>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">{email.body_html}</pre>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <EmailActions email={email} />
          <Card>
            <CardHeader><CardTitle>Linked proposal</CardTitle><CardDescription>Originating proposal.</CardDescription></CardHeader>
            <CardContent className="text-sm">
              {(email as any).proposals ? (
                <Link href={`/proposals/${(email as any).proposals.id}`} className="hover:underline">{(email as any).proposals.title}</Link>
              ) : (
                <span className="text-muted-foreground">No proposal linked.</span>
              )}
            </CardContent>
          </Card>
          {(email as any).email_threads?.gmail_thread_id ? (
            <Card>
              <CardHeader><CardTitle>Gmail thread</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <Link className="hover:underline" href={`/threads/${(email as any).email_threads.id}`}>View thread →</Link>
                <div className="text-xs text-muted-foreground mt-1 break-all">Gmail thread id: {(email as any).email_threads.gmail_thread_id}</div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

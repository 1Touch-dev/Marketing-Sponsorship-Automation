import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReplyClassificationBadge } from "@/components/shared/reply-classification-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ThreadDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: thread } = await sb.from("email_threads").select("*").eq("id", params.id).maybeSingle();
  if (!thread) notFound();

  const { data: messages } = await sb
    .from("emails")
    .select("id, subject, status, direction, sender, recipient, created_at, reply_classification, reply_summary")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  return (
    <>
      <PageHeader title={thread.subject ?? "Thread"} description={`Gmail thread ${thread.gmail_thread_id ?? "—"}`} />

      <Card>
        <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {messages?.length ? messages.map((m) => (
            <Link
              key={m.id}
              href={`/emails/${m.id}`}
              className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <div>
                <div className="text-sm font-medium">{m.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {m.direction} · {m.sender ?? "?"} → {m.recipient} · {formatDate(m.created_at)}
                </div>
                {m.reply_summary ? (
                  <div className="text-xs text-muted-foreground italic mt-0.5">{m.reply_summary}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <ReplyClassificationBadge classification={m.reply_classification} />
                <StatusBadge status={m.status} />
              </div>
            </Link>
          )) : <p className="text-sm text-muted-foreground">No messages tracked in this thread yet.</p>}
        </CardContent>
      </Card>
    </>
  );
}

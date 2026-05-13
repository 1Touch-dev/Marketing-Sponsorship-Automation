import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("email_threads")
    .select("id, subject, status, participants, last_message_at, gmail_thread_id")
    .order("last_message_at", { ascending: false });

  return (
    <>
      <PageHeader title="Email threads" description="Conversations tracked through Gmail." />
      {!data || data.length === 0 ? (
        <EmptyState title="No threads yet" description="Threads appear once an outreach email is drafted or sent." />
      ) : (
        <div className="space-y-3">
          {data.map((t) => (
            <Link
              key={t.id}
              href={`/threads/${t.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div className="font-medium">{t.subject ?? "(no subject)"}</div>
              <div className="text-xs text-muted-foreground">
                {t.participants?.join(", ") ?? "—"} · last activity {formatDate(t.last_message_at)} · status {t.status}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

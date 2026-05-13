import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("emails")
    .select("id, subject, status, recipient, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <>
      <PageHeader title="Emails" description="Drafts pending approval and sent messages." />
      {!data || data.length === 0 ? (
        <EmptyState title="No emails yet" description="Approved proposals can have outreach emails drafted." />
      ) : (
        <div className="space-y-3">
          {data.map((e) => (
            <Link
              key={e.id}
              href={`/emails/${e.id}`}
              className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div>
                <div className="font-medium">{truncate(e.subject, 90)}</div>
                <div className="text-xs text-muted-foreground">{e.recipient} · {formatDate(e.updated_at)}</div>
              </div>
              <StatusBadge status={e.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

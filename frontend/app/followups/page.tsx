import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FollowupsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("followups")
    .select("id, status, reason, suggested_body, scheduled_for, created_at, draft_email_id, proposal_id")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Follow-ups" description="Suggested and scheduled follow-up emails." />
      {!data || data.length === 0 ? (
        <EmptyState title="No follow-ups yet" description="Once an email has been sent, follow-up drafts can be generated here." />
      ) : (
        <div className="space-y-3">
          {data.map((f) => (
            <div key={f.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{f.reason ?? "Follow-up"}</div>
                <StatusBadge status={f.status} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">created {formatDate(f.created_at)}</div>
              {f.suggested_body ? <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap">{truncate(f.suggested_body, 280)}</p> : null}
              <div className="flex gap-3 mt-2 text-sm">
                {f.draft_email_id ? <Link href={`/emails/${f.draft_email_id}`} className="text-primary hover:underline">Open draft</Link> : null}
                {f.proposal_id ? <Link href={`/proposals/${f.proposal_id}`} className="text-primary hover:underline">Proposal</Link> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

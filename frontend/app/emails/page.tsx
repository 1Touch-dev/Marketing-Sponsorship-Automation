import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMAIL_STATUSES = ["draft", "pending_approval", "approved", "sent", "opened", "replied", "bounced", "failed"];

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const sb = supabaseAdmin();
  let query = sb
    .from("emails")
    .select("id, subject, status, recipient, updated_at, opened_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (searchParams.status) query = query.eq("status", searchParams.status);

  const { data } = await query;
  let emails = data ?? [];

  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    emails = emails.filter(
      (e) => e.subject.toLowerCase().includes(q) || e.recipient.toLowerCase().includes(q),
    );
  }

  return (
    <>
      <PageHeader title="Emails" description="Drafts pending approval and sent messages." />

      {/* Filter bar */}
      <form method="GET" className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search by subject or recipient…"
          className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1 min-w-[160px] outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
        >
          <option value="">All statuses</option>
          {EMAIL_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        {(searchParams.q || searchParams.status) && (
          <a href="/emails" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Clear
          </a>
        )}
      </form>

      {emails.length === 0 ? (
        <EmptyState
          title="No emails yet"
          description="Approved proposals can have outreach emails drafted."
        />
      ) : (
        <div className="space-y-3">
          {emails.map((e) => (
            <Link
              key={e.id}
              href={`/emails/${e.id}`}
              className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div>
                <div className="font-medium">{truncate(e.subject, 90)}</div>
                <div className="text-xs text-muted-foreground">
                  {e.recipient} · {formatDate(e.updated_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {e.opened_at && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Opened
                  </span>
                )}
                <StatusBadge status={e.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

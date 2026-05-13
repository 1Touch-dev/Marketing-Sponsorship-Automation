import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_email: string | null;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { q?: string; entity_type?: string; action?: string };
}) {
  const sb = supabaseAdmin();
  let query = sb
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (searchParams.q) {
    query = query.or(
      `action.ilike.%${searchParams.q}%,actor_email.ilike.%${searchParams.q}%,entity_type.ilike.%${searchParams.q}%`,
    );
  }
  if (searchParams.entity_type) query = query.eq("entity_type", searchParams.entity_type);
  if (searchParams.action) query = query.ilike("action", `%${searchParams.action}%`);

  const { data } = await query;
  const logs = (data ?? []) as AuditLog[];

  return (
    <>
      <PageHeader title="Audit log" description="All recorded actions across the platform." />

      {/* Search/filter bar */}
      <form method="GET" className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search action, email, entity…"
          className="rounded-md border bg-background px-3 py-1.5 text-sm min-w-[200px] flex-1 outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          name="entity_type"
          defaultValue={searchParams.entity_type ?? ""}
          className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All entities</option>
          {["campaign", "proposal", "email", "followup", "company", "user", "ai_output", "workflow"].map(
            (e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ),
          )}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        {(searchParams.q || searchParams.entity_type || searchParams.action) && (
          <a
            href="/audit"
            className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Clear
          </a>
        )}
      </form>

      {logs.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Audit logs are created automatically as you use the platform."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium hidden sm:table-cell">Entity</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Actor</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {a.entity_type}
                    </Badge>
                    {a.entity_id && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {a.entity_id.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs hidden md:table-cell">
                    {a.actor_email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(a.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

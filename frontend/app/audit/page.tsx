import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const sb = supabaseAdmin();
  let query = sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
  if (searchParams.type) query = query.eq("entity_type", searchParams.type);
  if (searchParams.q) query = query.ilike("action", `%${searchParams.q}%`);
  const { data } = await query;

  return (
    <>
      <PageHeader title="Audit logs" description="Every important action is recorded here." />
      <form className="mb-4 flex gap-2" action="/audit">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Filter by action…"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="type"
          defaultValue={searchParams.type ?? ""}
          placeholder="entity_type"
          className="h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Filter</button>
      </form>

      {!data || data.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-2"><div>{row.entity_type}</div><div className="text-xs text-muted-foreground">{row.entity_id ?? "—"}</div></td>
                    <td className="px-4 py-2 font-mono text-xs">{row.action}</td>
                    <td className="px-4 py-2 text-xs">{row.actor_email ?? "—"}</td>
                    <td className="px-4 py-2 text-xs max-w-md"><pre className="whitespace-pre-wrap text-muted-foreground">{row.metadata ? JSON.stringify(row.metadata, null, 0) : "—"}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

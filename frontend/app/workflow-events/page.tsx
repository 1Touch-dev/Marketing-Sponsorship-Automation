import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  started: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  retried: "bg-orange-100 text-orange-700",
};

type WorkflowEvent = {
  id: string;
  workflow_name: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  error_message: string | null;
  attempt: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export default async function WorkflowEventsPage({
  searchParams,
}: {
  searchParams: { status?: string; workflow?: string };
}) {
  const sb = supabaseAdmin();
  let query = sb
    .from("workflow_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.workflow) query = query.ilike("workflow_name", `%${searchParams.workflow}%`);

  const { data } = await query;
  const events = (data ?? []) as WorkflowEvent[];

  const statuses = ["started", "processing", "completed", "failed", "retried"];

  return (
    <>
      <PageHeader
        title="Workflow events"
        description="Visibility into AI generation, Gmail, and approval workflow runs."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a
          href="/workflow-events"
          className={`rounded-full px-3 py-1 text-xs border ${!searchParams.status ? "bg-foreground text-background" : "hover:bg-accent"}`}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/workflow-events?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs border ${
              searchParams.status === s ? "bg-foreground text-background" : "hover:bg-accent"
            }`}
          >
            {s}
          </a>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState title="No workflow events" description="Events appear when workflows run." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Workflow</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium hidden sm:table-cell">Entity</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Attempt</th>
                <th className="px-4 py-2 font-medium hidden lg:table-cell">Error</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">{e.workflow_name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[e.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                    {e.entity_type ?? "—"}
                    {e.entity_id && (
                      <span className="ml-1 font-mono text-xs opacity-60">
                        {e.entity_id.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center hidden md:table-cell">{e.attempt}</td>
                  <td className="px-4 py-2 text-destructive text-xs max-w-xs truncate hidden lg:table-cell">
                    {e.error_message ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(e.created_at)}
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

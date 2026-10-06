import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { loadRegistry } from "@/lib/claims/store";
import { ClaimRow, NewClaimForm, type ClaimRowData } from "./claim-actions";

export const dynamic = "force-dynamic";

const STATE_ORDER = ["disputed", "unsupported", "unreviewed", "expired", "scheduled", "expiring_soon", "current", "retired"];
const STATE_LABEL: Record<string, string> = {
  current: "Current",
  expiring_soon: "Expiring soon",
  scheduled: "Not effective yet",
  expired: "Expired",
  unreviewed: "Needs verification",
  disputed: "Disputed",
  unsupported: "Missing source / owner / dates",
  retired: "Retired",
};

export default async function ClaimsPage() {
  const tenantId = await resolveTenantId();
  const res = await loadRegistry(supabaseAdmin(), tenantId);

  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Claims registry" description="Every figure a sponsor can see, with its source, owner and expiry." />
        <p className="rounded-lg border bg-card p-4 text-sm">
          {res.reason === "migration_missing"
            ? "The claims registry has not been set up yet (migration 0056)."
            : `Could not load the registry: ${res.error}`}
        </p>
      </div>
    );
  }

  const rows: ClaimRowData[] = res.entries
    .map((e) => ({
      id: e.id,
      key: e.key,
      label: e.label,
      category: e.category,
      retired: !!e.retired_at,
      versionCount: e.versionCount,
      state: e.evaluation.state,
      usable: e.evaluation.usable,
      reasons: e.evaluation.reasons,
      daysToExpiry: e.evaluation.daysToExpiry,
      current: {
        id: e.current.id,
        version: e.current.version,
        value: e.current.value,
        unit: e.current.unit,
        description: e.current.description,
        source_kind: e.current.source_kind,
        source_ref: e.current.source_ref,
        source_url: e.current.source_url,
        effective_date: e.current.effective_date,
        expires_at: e.current.expires_at,
        owner: e.current.owner,
        created_by_email: e.current.created_by_email,
      },
      reviews: e.reviews.map((r) => ({ decision: r.decision, reviewer_email: r.reviewer_email, note: r.note, created_at: r.created_at })),
    }))
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.key.localeCompare(b.key));

  const usable = rows.filter((r) => r.usable).length;
  const groups = STATE_ORDER.map((s) => ({ state: s, items: rows.filter((r) => r.state === s) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Claims registry" description="Every figure a sponsor can see, with its source, owner and expiry." />

      <p className="text-sm text-muted-foreground" data-testid="claims-summary">
        <span className="font-semibold text-foreground">{usable} of {rows.length} claims</span> can be shown to sponsors now. A figure is shown only when it
        has a source, an owner and dates, is in date, and a second person has verified it. Changing a figure creates a new version that must be verified again.
      </p>

      <NewClaimForm />

      {groups.map((g) => (
        <section key={g.state} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {STATE_LABEL[g.state]} ({g.items.length})
          </h2>
          <div className="space-y-2">
            {g.items.map((r) => (
              <ClaimRow key={r.id} claim={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

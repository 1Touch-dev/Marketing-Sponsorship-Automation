import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listIssued, renewalBasis } from "@/lib/recap/store";
import type { Figure, Financial, Gap } from "@/lib/recap/model";
import { PageHeader } from "@/components/shared/page-header";
import { IssueRecap } from "./issue-recap";

export const dynamic = "force-dynamic";

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function figureValue(figure: Figure) {
  const value = typeof figure.value === "number" ? figure.value.toLocaleString("en-US") : figure.value;
  return figure.unit ? `${value} ${figure.unit}` : value;
}

function FinancialBlock({ financial }: { financial: Financial }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cash and barter</h2>
      <p className="text-sm">{financial.note}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Cash committed</dt><dd>{money(financial.cash.committed)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Cash invoiced</dt><dd>{money(financial.cash.invoiced)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Cash settled</dt><dd>{money(financial.cash.settled)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Barter committed</dt><dd>{money(financial.barter.committed)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Barter received</dt><dd>{money(financial.barter.received)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Savings realized</dt><dd>{money(financial.savings_realized)}</dd></div>
      </dl>
    </section>
  );
}

function FigurePanel({ heading, figures, empty }: { heading: string; figures: Figure[]; empty: string }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{heading}</h2>
      {figures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {figures.map((figure) => (
            <li key={figure.id}>
              <p className="text-sm font-medium">{figure.label}</p>
              <p className="text-sm">{figureValue(figure)}</p>
              {figure.source && <p className="text-xs text-muted-foreground">Source: {figure.source}</p>}
              {figure.note && <p className="text-xs text-muted-foreground">{figure.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ContractRecapPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb.from("contracts").select("id, title").eq("id", params.id).eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    return <p role="alert" className="text-sm text-red-600">{error.message}</p>;
  }
  if (!data) notFound();

  const built = await renewalBasis(sb, tenantId, params.id);
  const issued = built.ok ? await listIssued(sb, tenantId, { contractId: params.id }) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Recap — ${data.title}`}
        description="Sold, scheduled, delivered, evidenced, and accepted. Measured results stay apart from estimates."
        actions={
          <Link href={`/contracts/${params.id}`} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            Back to delivery
          </Link>
        }
      />

      {!built.ok && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {built.error}
        </p>
      )}

      {built.ok && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["Sold", built.value.recap.commitments.sold],
                ["Scheduled", built.value.recap.commitments.scheduled],
                ["Delivered", built.value.recap.commitments.delivered],
                ["Evidenced", built.value.recap.commitments.evidenced],
                ["Accepted", built.value.recap.commitments.accepted],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FigurePanel heading="Measured" figures={built.value.recap.measured} empty="No measured results." />
            <FigurePanel heading="Estimate, not a result" figures={built.value.recap.modeled} empty="No estimates are recorded." />
          </div>

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="text-base font-semibold">Gaps</h2>
            {built.value.recap.gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gaps.</p>
            ) : (
              <ul className="space-y-3">
                {built.value.recap.gaps.map((gap: Gap, index) => (
                  <li key={`${gap.kind}-${gap.subject ?? "none"}-${index}`} className="text-sm">
                    <p>{gap.message}</p>
                    <p className="text-xs text-muted-foreground">What closes it: {gap.fix}</p>
                    {gap.blocking && <p className="text-xs font-medium text-amber-700">Blocking</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <FinancialBlock financial={built.value.recap.financial} />

          <IssueRecap contractId={params.id} gapCount={built.value.recap.gap_count} />

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Issued versions</h2>
            {issued && !issued.ok && (
              <p role="alert" className="text-sm text-red-600">{issued.error}</p>
            )}
            {issued && issued.ok && issued.value.length === 0 && (
              <p className="text-sm text-muted-foreground">No version has been issued.</p>
            )}
            {issued && issued.ok && issued.value.length > 0 && (
              <ul className="divide-y rounded-xl border bg-card">
                {issued.value.map((version) => (
                  <li key={version.id} className="px-4 py-3 text-sm">
                    <span className="font-medium">Version {version.version}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {new Date(version.issued_at).toLocaleString("pt-BR")}
                      {" · "}
                      {version.status}
                      {" · "}
                      {version.gap_count} gap{version.gap_count === 1 ? "" : "s"}
                      {" · "}
                      {version.issued_by}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

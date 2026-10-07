import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { checkDiscoveryGate, listBriefs } from "@/lib/briefs/store";
import { BriefForm } from "./brief-form";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("id, company_name").eq("id", params.id).eq("tenant_id", tenantId).maybeSingle();
  if (!company) notFound();

  const gate = await checkDiscoveryGate(sb, tenantId, company.id, company.company_name);
  const briefs = await listBriefs(sb, tenantId, company.id);
  const latest = briefs.ok ? briefs.value[0] : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Buyer brief: ${company.company_name}`} description="What the buyer wants, written down before a proposal is generated." />
      <p className="text-sm">
        <Link href={`/companies/${company.id}`} className="underline">Back to the company</Link>
      </p>

      <div className={`rounded-lg border p-4 text-sm ${gate.ok && gate.enforced ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`} data-testid="gate-status">
        {!gate.enforced
          ? "Buyer briefs are not set up yet (migration 0060), so proposal generation is not gated."
          : gate.ok
            ? `A proposal can be generated: a ${gate.level} brief is on file.`
            : `A proposal cannot be generated yet: ${gate.missing.join(", ")}.`}
      </div>

      {latest && (
        <div className="rounded-lg border bg-card p-4 text-sm space-y-1" data-testid="latest-brief">
          <p className="font-semibold">Latest brief ({latest.level}, by {latest.author_email}, {latest.created_at.slice(0, 10)})</p>
          <p>Objective: {latest.objective}</p>
          <p>Period: {latest.period_start} to {latest.period_end}</p>
          <p>Point of contact: {latest.contact_name}{latest.contact_email ? ` (${latest.contact_email})` : ""}</p>
          <p>Next action: {latest.next_action}{latest.next_action_due ? ` by ${latest.next_action_due}` : ""}</p>
          {latest.why_sponsor && <p>Why this sponsor: {latest.why_sponsor}</p>}
          {latest.why_package && <p>Why this package: {latest.why_package}</p>}
          {latest.unverified.length > 0 && <p>Still unverified: {latest.unverified.join("; ")}</p>}
        </div>
      )}

      <BriefForm companyId={company.id} />
    </div>
  );
}

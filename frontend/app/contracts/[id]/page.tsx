import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listObligations } from "@/lib/obligations/store";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateOnly } from "@/lib/utils";
import { DeliveryBoard, HandoffButton, ProofPackButton, type ObligationListRow } from "./delivery-panel";

export const dynamic = "force-dynamic";

export default async function ContractDeliveryPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb
    .from("contracts")
    .select("id, contract_number, title, status, start_date, end_date, companies(company_name)")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    return <p role="alert" className="text-sm text-red-600">{error.message}</p>;
  }
  if (!data) notFound();

  const contract = data as unknown as {
    id: string;
    contract_number: string | null;
    title: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    companies: { company_name: string } | null;
  };
  const listed = await listObligations(sb, tenantId, { contractId: contract.id });
  const rows: ObligationListRow[] = listed.ok
    ? listed.value.map((row) => ({
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        owner_email: row.owner_email,
        status: row.status,
        timing: row.timing,
        proof: row.proof,
        actions: row.actions,
        match_id: row.match_id ?? null,
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.title}
        description="What is due, grouped by due date."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/contracts" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              Back to contracts
            </Link>
            <Link href={`/contracts/${contract.id}/recap`} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              Recap
            </Link>
            <ProofPackButton contractId={contract.id} />
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        {contract.companies?.company_name ?? "No company"}
        {" · "}
        {contract.contract_number || contract.id.slice(0, 8)}
        {" · "}
        {contract.status}
        {" · "}
        {contract.start_date ? formatDateOnly(contract.start_date) : "—"} — {contract.end_date ? formatDateOnly(contract.end_date) : "—"}
      </p>

      {!listed.ok && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listed.error}
        </p>
      )}

      {listed.ok && rows.length === 0 && (
        <div className="rounded-xl border bg-card p-8">
          <p className="text-sm text-muted-foreground">This contract has no obligations.</p>
          <HandoffButton contractId={contract.id} />
        </div>
      )}

      {listed.ok && rows.length > 0 && <DeliveryBoard rows={rows} />}
    </div>
  );
}

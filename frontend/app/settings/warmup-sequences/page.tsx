import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { WarmupSequencesManager } from "./warmup-sequences-manager";

export const dynamic = "force-dynamic";

export default async function WarmupSequencesPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  let sequences: Record<string, unknown>[] = [];
  let migrationPending = false;

  try {
    const { data, error } = await sb
      .from("warmup_sequences")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) migrationPending = true;
    else sequences = (data as Record<string, unknown>[]) ?? [];
  } catch {
    migrationPending = true;
  }

  return (
    <>
      <PageHeader
        title="Warm-up Strategies"
        description="Build reusable relationship-building sequences — invite a decision-maker to a match, host a dinner, then send the proposal — and enroll companies before pitching them."
      />
      <WarmupSequencesManager initialSequences={sequences} migrationPending={migrationPending} />
    </>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/pipedrive/sync";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";
  const variant = searchParams.get("variant") ?? "A";

  await sb.from("audit_logs").insert({
    action: "proposal.view",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: { token, variant, user_agent: req.headers.get("user-agent"), timestamp: new Date().toISOString() },
  });

  // Sync to Pipedrive as activity
  try {
    const { data: prop } = await sb
      .from("proposals")
      .select("title, companies(company_name)")
      .eq("id", params.id)
      .single();
    if (prop) {
      const companyName = Array.isArray(prop.companies)
        ? (prop.companies[0] as { company_name: string } | undefined)?.company_name
        : (prop.companies as { company_name: string } | null)?.company_name;
      const dealTitle = `${companyName} × Coritiba FC — ${prop.title}`;
      logActivity({ dealTitle, activityType: "Proposta visualizada", note: `Sponsor viewed proposal at ${new Date().toISOString()}` }).catch(() => {});
    }
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true });
}

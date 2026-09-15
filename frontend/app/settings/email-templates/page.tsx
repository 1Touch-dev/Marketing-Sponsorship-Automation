import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { EmailTemplatesManager } from "./email-templates-manager";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  let templates: Record<string, unknown>[] = [];
  try {
    const { data } = await sb
      .from("email_templates")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    templates = (data as Record<string, unknown>[]) ?? [];
  } catch {
    // migration 0025 pending
  }

  return (
    <>
      <PageHeader
        title="Email Templates"
        description="Manage reusable email templates with variable placeholders for outreach campaigns."
      />
      <EmailTemplatesManager initialTemplates={templates} />
    </>
  );
}

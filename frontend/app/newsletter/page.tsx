import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { NewsletterClient } from "./newsletter-client";
import {
  deliveryCountsByNewsletter,
  newsletterUnsubscribes,
} from "@/lib/mail/newsletter-analytics";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  // Fetch companies for recipient picker
  const { data: companies } = await sb
    .from("companies")
    .select("id, company_name, industry")
    .eq("tenant_id", tenantId)
    .order("company_name");

  // Fetch contact count per company
  let contactCountMap: Record<string, number> = {};
  try {
    const { data: contacts } = await sb
      .from("contacts")
      .select("company_id")
      .eq("tenant_id", tenantId);
    for (const c of contacts ?? []) {
      contactCountMap[c.company_id] = (contactCountMap[c.company_id] ?? 0) + 1;
    }
  } catch {
    // contacts table may not exist yet
  }

  // Fetch past newsletters
  let newsletters: Array<{
    id: string;
    subject: string;
    recipient_count: number;
    status: string;
    sent_at: string | null;
    created_at: string;
    scheduled_for?: string | null;
  }> = [];
  try {
    const { data } = await sb
      .from("newsletters")
      .select("id, subject, recipient_count, status, sent_at, created_at, scheduled_for")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    newsletters = (data ?? []) as typeof newsletters;
  } catch {
    // table may not exist yet
  }

  // Fetch email templates
  let templates: Array<{ id: string; name: string; subject: string; body_html?: string }> = [];
  try {
    const { data } = await sb
      .from("email_templates")
      .select("id, name, subject, body_html")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    templates = (data ?? []) as typeof templates;
  } catch {
    // table may not exist
  }

  let unsubscribeCount = 0;
  const unsubs = await newsletterUnsubscribes(sb, tenantId);
  if (unsubs.ok) unsubscribeCount = unsubs.rows.length;

  // Exact per-status counts (head counts) — avoids PostgREST row caps.
  let deliveryCounts: Record<string, Record<string, number>> = {};
  let totalSent = 0;
  const counted = await deliveryCountsByNewsletter(
    sb,
    tenantId,
    newsletters.map((n) => n.id),
  );
  if (counted.ok) {
    deliveryCounts = counted.counts as Record<string, Record<string, number>>;
    for (const c of Object.values(deliveryCounts)) {
      for (const status of ["accepted", "delivered", "bounced", "complained"] as const) {
        totalSent += c[status] ?? 0;
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Newsletter"
        description="Compose and send bulk outreach emails to sponsor contacts"
      />
      <NewsletterClient
        companies={(companies ?? []).map((c) => ({
          ...c,
          contact_count: contactCountMap[c.id] ?? 0,
        }))}
        newsletters={newsletters}
        templates={templates}
        totalSent={totalSent}
        deliveryCounts={deliveryCounts}
        unsubscribeCount={unsubscribeCount}
      />
    </>
  );
}

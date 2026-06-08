import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { NewsletterClient } from "./newsletter-client";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const sb = supabaseAdmin();

  // Fetch companies for recipient picker
  const { data: companies } = await sb
    .from("companies")
    .select("id, company_name, industry")
    .order("company_name");

  // Fetch contact count per company
  let contactCountMap: Record<string, number> = {};
  try {
    const { data: contacts } = await sb
      .from("contacts")
      .select("company_id");
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
  }> = [];
  try {
    const { data } = await sb
      .from("newsletters")
      .select("id, subject, recipient_count, status, sent_at, created_at")
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
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    templates = (data ?? []) as typeof templates;
  } catch {
    // table may not exist
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
      />
    </>
  );
}

import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { ContactsClient } from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const sb = supabaseAdmin();

  // Fetch all contacts with company info
  let contacts: Array<{
    id: string;
    company_id: string;
    email: string;
    full_name: string | null;
    title: string | null;
    department: string | null;
    seniority: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source: string | null;
    confidence: number | null;
    notes: string | null;
    created_at: string;
    companies: { company_name: string; industry: string | null } | null;
  }> = [];

  try {
    const { data } = await sb
      .from("contacts")
      .select("*, companies(company_name, industry)")
      .order("created_at", { ascending: false })
      .limit(500);
    contacts = (data ?? []) as typeof contacts;
  } catch {
    // Table may not exist yet
    contacts = [];
  }

  // Fetch companies for the add-contact form
  const { data: companies } = await sb
    .from("companies")
    .select("id, company_name")
    .order("company_name");

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${contacts.length} contact${contacts.length !== 1 ? "s" : ""} — key persons at sponsor companies`}
      />
      <ContactsClient contacts={contacts} companies={companies ?? []} />
    </>
  );
}

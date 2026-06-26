import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time migration runner for contracts table
export async function POST() {
  const sb = supabaseAdmin();
  
  // Check if contracts table exists
  const { error: checkErr } = await sb.from("contracts").select("id").limit(1);
  
  if (!checkErr) {
    return NextResponse.json({ ok: true, message: "Contracts table already exists" });
  }
  
  // Table doesn't exist — we need to create it via pg_execute (not available)
  // Instead, use the supabase REST API with service role to insert into rpc
  // Since direct DDL is not available via REST, return instructions
  return NextResponse.json({
    ok: false,
    message: "Contracts table does not exist. Please run the migration in Supabase Dashboard SQL editor.",
    sql: `
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contract_number TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  total_value_brl NUMERIC(12,2),
  deal_type TEXT DEFAULT 'sponsorship' CHECK (deal_type IN ('sponsorship','barter','lei_de_incentivo','media','naming_rights')),
  start_date DATE,
  end_date DATE,
  payment_schedule JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','pending_signature')),
  notes TEXT,
  signed_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.contracts USING (true);
  END IF;
END $$;
    `.trim(),
    dashboard_url: "https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new",
  });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { error } = await sb.from("contracts").select("id").limit(1);
  return NextResponse.json({
    contracts_table_exists: !error,
    error: error?.message ?? null,
  });
}

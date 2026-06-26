-- Contracts table for Sprint 4 contract module
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
CREATE POLICY "service_role_all" ON public.contracts USING (true);

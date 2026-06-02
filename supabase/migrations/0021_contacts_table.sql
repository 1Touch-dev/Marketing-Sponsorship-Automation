-- Migration 0021: contacts table for saved Hunter.io / Apollo contacts
-- Apply in Supabase SQL editor

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  title TEXT,
  department TEXT,
  seniority TEXT,
  phone TEXT,
  linkedin_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- 'hunter', 'apollo', 'manual', 'linkedin'
  confidence INTEGER,
  notes TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS contacts_company_id_idx ON contacts(company_id);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email);

-- RLS: allow service role (used by API) full access
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on contacts"
  ON contacts FOR ALL
  USING (true)
  WITH CHECK (true);

-- 26-july-sprint migrations
-- Run in Supabase SQL editor

-- 1. Add sponsorship_fit_score to companies intelligence
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sponsorship_fit_score integer;

-- 2. Add sender_profile_id to emails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS sender_profile_id uuid REFERENCES sender_profiles(id) ON DELETE SET NULL;

-- 3. Add ab_test_config to proposals for A/B landing page testing
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ab_test_config jsonb;

-- 4. Add newsletter_config to settings or create newsletter_segments table
CREATE TABLE IF NOT EXISTS newsletter_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry_filter text,
  send_day integer DEFAULT 1,  -- 1=Monday...7=Sunday
  send_hour integer DEFAULT 9,
  subject_template text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Ensure contacts table exists with source tracking
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL,
  title text,
  department text,
  seniority text,
  phone text,
  linkedin_url text,
  source text DEFAULT 'manual',
  confidence integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, email)
);

-- 6. Add renewal tracking to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewed_from_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url text;

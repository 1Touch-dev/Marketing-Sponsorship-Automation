-- Migration 0022: domain source tracking on companies
-- Stores the canonical domain and how it was discovered, enabling the
-- domain-independent enrichment pipeline (4 June 2026 requirements).
-- Apply in Supabase SQL editor.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS domain              TEXT,
  ADD COLUMN IF NOT EXISTS domain_source       TEXT
    CHECK (domain_source IN (
      'manual', 'website', 'apollo', 'hunter',
      'crm_contact', 'email_inference', 'discovery'
    )),
  ADD COLUMN IF NOT EXISTS domain_confidence   NUMERIC(3, 2),   -- 0.00–1.00
  ADD COLUMN IF NOT EXISTS domain_updated_at   TIMESTAMPTZ;

-- Index for fast lookups by domain (useful for CRM contact → company matching)
CREATE INDEX IF NOT EXISTS companies_domain_idx ON companies(domain);

-- Backfill domain from existing website values where possible
UPDATE companies
SET
  domain        = lower(regexp_replace(
                    regexp_replace(website, '^https?://(www\.)?', ''),
                    '/.*$', ''
                  )),
  domain_source = 'website',
  domain_updated_at = NOW()
WHERE
  website IS NOT NULL
  AND website <> ''
  AND domain IS NULL;

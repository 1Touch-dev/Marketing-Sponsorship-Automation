-- Migration 0009: Company Intelligence Platform
-- Adds tags, segmentation, size labels, business type, competitor tracking,
-- AI intelligence cache, and contact management to companies.

-- ─────────────────────────────────────────────────────────────────────────────
-- companies: new intelligence + segmentation columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Segmentation: local / state / national / international
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'local';

-- Size: small / medium / large
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_size TEXT DEFAULT 'medium';

-- Business type: B2B / B2C / Both
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'B2C';

-- Tags: free-form array of labels
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Logo URL
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Sponsorship history notes
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sponsorship_history TEXT;

-- AI competitor analysis cache (array of competitor company names)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]';

-- AI full intelligence cache (richer than proposal.intelligence)
-- Shape: { marketing_goals, brand_positioning, audience_alignment,
--          sponsorship_fit_score, recommended_direction, target_audience,
--          products_services, local_context, global_inspiration,
--          competitor_brands, sponsorship_history }
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS full_intelligence JSONB DEFAULT NULL;

-- Last AI analysis timestamp
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS intelligence_updated_at TIMESTAMPTZ DEFAULT NULL;

-- CRM / pipeline stage
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'prospect';

-- Primary contact info (lightweight — full CRM via pipeline module)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes on new company columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_companies_segment ON public.companies(segment);
CREATE INDEX IF NOT EXISTS idx_companies_company_size ON public.companies(company_size);
CREATE INDEX IF NOT EXISTS idx_companies_business_type ON public.companies(business_type);
CREATE INDEX IF NOT EXISTS idx_companies_pipeline_stage ON public.companies(pipeline_stage);

-- GIN index on tags array for fast tag searches
CREATE INDEX IF NOT EXISTS idx_companies_tags ON public.companies USING GIN(tags);

NOTIFY pgrst, 'reload schema';

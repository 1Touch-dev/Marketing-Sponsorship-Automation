-- =============================================================================
-- 0012 — Block Library, Export Tracking, and SerpAPI Intelligence
-- =============================================================================
-- Adds:
--   proposal_sections.is_library_item  — marks a section as a reusable block
--   proposal_sections.tags             — array of tags for filtering
--   proposals.metadata                 — JSONB for export tracking counters
-- All changes are safe (IF NOT EXISTS / idempotent)
-- =============================================================================

-- ── proposal_sections: block library columns ──────────────────────────────────
ALTER TABLE public.proposal_sections
  ADD COLUMN IF NOT EXISTS is_library_item BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Index for fast library lookups
CREATE INDEX IF NOT EXISTS idx_proposal_sections_library
  ON public.proposal_sections(is_library_item)
  WHERE is_library_item = TRUE;

-- ── proposals: metadata column for export tracking ───────────────────────────
-- (stores: exports_pdf_print, exports_pdf_executive, total_exports, last_exported_at)
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ── companies: ensure serp intelligence columns exist ────────────────────────
-- These should already exist from 0009, but add safely
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS company_size TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'B2C',
  ADD COLUMN IF NOT EXISTS full_intelligence JSONB DEFAULT NULL;

-- ── audit_logs: ensure metadata column exists ────────────────────────────────
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

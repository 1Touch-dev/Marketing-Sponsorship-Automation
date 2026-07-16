-- Migration 0039: Proposal templates — industry tagging + usage
-- Additive + idempotent. Activates the (previously unused) proposal_templates
-- table for James's "templates per industry + reusable pages + image placeholders".
-- Image placeholders are stored inside content.image_placeholders (JSONB) — no
-- schema change needed for those.

ALTER TABLE public.proposal_templates
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS preset_id TEXT,       -- optional base preset (sponsorship/barter/...)
  ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS proposal_templates_industry_idx
  ON public.proposal_templates(industry);

-- content JSONB shape used by the app:
-- {
--   "sections": ["executive_summary", ...],
--   "default_content": { "executive_summary": "…", ... },
--   "image_placeholders": [
--     { "key": "hero_jersey", "label": "Jersey mockup", "type": "jersey",
--       "prompt_hint": "Sponsor logo on chest", "required": true }
--   ]
-- }

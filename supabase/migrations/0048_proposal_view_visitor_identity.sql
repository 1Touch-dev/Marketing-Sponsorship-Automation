-- Migration 0048: Per-visitor identified engagement on proposal_views.
--
-- Previously (migration 0046) proposal_views tracked view SESSIONS only —
-- every row was anonymous, so the admin UI could only ever show an
-- aggregate count ("14 views"), never "who" viewed or how many times a
-- specific person came back. This adds a stable client-generated
-- visitor_key (persisted in the visitor's browser via localStorage across
-- repeat visits) plus optional identity fields, populated once a visitor
-- self-identifies via the existing lead-interest form
-- (app/api/proposals/[id]/interest) — at which point the app retroactively
-- backfills their prior anonymous sessions for this proposal.

ALTER TABLE public.proposal_views
  ADD COLUMN IF NOT EXISTS visitor_key    TEXT,
  ADD COLUMN IF NOT EXISTS visitor_name   TEXT,
  ADD COLUMN IF NOT EXISTS visitor_email  TEXT,
  ADD COLUMN IF NOT EXISTS visitor_company TEXT;

CREATE INDEX IF NOT EXISTS proposal_views_visitor_key_idx
  ON public.proposal_views(proposal_id, visitor_key);

NOTIFY pgrst, 'reload schema';

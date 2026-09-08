-- Migration 0046: Proposal engagement analytics (Phase 5 — sponsor-facing
-- share-link tracking, master_report.md Section 4 P0 item #3: "Native
-- engagement analytics on every shared proposal (views, drop-off,
-- time-on-page) + automated 'gone cold' nudge". Flagged in
-- PLATFORM_ROADMAP.md as startable pre-multi-tenancy, extending the
-- existing (view-count-only) tracking in app/api/proposals/[id]/track-view.
--
-- Previously: a view only ever wrote one audit_logs row with no way to
-- measure engagement depth (time spent, how far they scrolled) — just a
-- raw count. This adds a dedicated table for that, one row per viewing
-- session, created on page load and updated with final metrics on unload.

CREATE TABLE IF NOT EXISTS public.proposal_views (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  variant               TEXT DEFAULT 'A',
  time_on_page_seconds  INTEGER,
  max_scroll_pct        INTEGER CHECK (max_scroll_pct IS NULL OR (max_scroll_pct >= 0 AND max_scroll_pct <= 100)),
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_views_proposal_idx ON public.proposal_views(proposal_id);
CREATE INDEX IF NOT EXISTS proposal_views_created_at_idx ON public.proposal_views(created_at DESC);

DROP TRIGGER IF EXISTS trg_proposal_views_updated_at ON public.proposal_views;
CREATE TRIGGER trg_proposal_views_updated_at
BEFORE UPDATE ON public.proposal_views
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.proposal_views ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='proposal_views' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.proposal_views FOR ALL TO service_role USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

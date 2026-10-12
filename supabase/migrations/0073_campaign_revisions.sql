-- Migration 0073: immutable campaign revisions; a campaign's pre-approval is bound to the revision that was approved
-- (Priority 6).
--
-- Why: pre-approving a campaign lets the Outreach Agent run on it in batches without a person approving each proposal.
-- Until now that approval was a flag. Editing the campaign's text afterwards left the flag standing, so the agent kept
-- running unattended on wording nobody had approved. Proposals already work the other way (migration 0052: a frozen
-- revision, and a changed text clears the approval); this gives campaigns the same.
--
-- Additive only: a new table and a new column. The running app keeps working before and after this is applied, and a
-- campaign that is pre-approved today stays so until the app is deployed with this change; after that it has to be
-- approved once more, which freezes the wording it is approved on.

CREATE TABLE IF NOT EXISTS public.campaign_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  -- the campaign's own text: title, summary, objective, cta, description, activation, strategy
  content         jsonb NOT NULL,
  -- the inventory items that are part of the package (included ones only)
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_brl       numeric(14, 2) NOT NULL DEFAULT 0,
  checksum        text NOT NULL CHECK (length(checksum) = 64),
  reason          text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (campaign_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_campaign_revisions_campaign ON public.campaign_revisions (campaign_id, revision_number DESC);

CREATE OR REPLACE FUNCTION public.campaign_revisions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT tenant_id FROM public.campaigns WHERE id = NEW.campaign_id) IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'that campaign belongs to another club';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'campaign_revisions rows are immutable'; END IF;
  -- a revision goes only together with its campaign or its club, never on its own
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE id = OLD.campaign_id) AND EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
    RAISE EXCEPTION 'campaign_revisions rows cannot be deleted while their campaign exists';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_campaign_revisions_guard ON public.campaign_revisions;
CREATE TRIGGER trg_campaign_revisions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_revisions FOR EACH ROW EXECUTE FUNCTION public.campaign_revisions_guard();

ALTER TABLE public.campaign_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_campaign_revisions" ON public.campaign_revisions;
CREATE POLICY "service_all_campaign_revisions" ON public.campaign_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The revision a campaign's pre-approval is bound to.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS approved_revision_id uuid REFERENCES public.campaign_revisions(id) ON DELETE SET NULL;

-- ...and it has to be one of that campaign's own revisions.
CREATE OR REPLACE FUNCTION public.campaigns_approved_revision_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.approved_revision_id IS NOT NULL AND NEW.approved_revision_id IS DISTINCT FROM OLD.approved_revision_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.campaign_revisions r WHERE r.id = NEW.approved_revision_id AND r.campaign_id = NEW.id AND r.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'a campaign can only be approved on one of its own revisions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_campaigns_approved_revision_guard ON public.campaigns;
CREATE TRIGGER trg_campaigns_approved_revision_guard BEFORE UPDATE OF approved_revision_id ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.campaigns_approved_revision_guard();

NOTIFY pgrst, 'reload schema';

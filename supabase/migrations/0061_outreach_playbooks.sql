-- Migration 0061: relationship-first outreach playbooks (Task 13).
--
-- Until now every first email was a sales pitch built from an approved proposal,
-- and an email could only be tied to a company through its proposal. A first
-- touch does not have to be a pitch: it can be a conversation, an invitation or
-- an introduction, and none of those has a proposal behind it.
--
--   emails.company_id    which company an email is for, with or without a proposal
--   emails.playbook      conversation | invitation | introduction | pitch
--   emails.playbook_note why a person used something other than the default
--
-- Existing outbound emails were all pitches written from a proposal, so they are
-- backfilled that way. Additive only.

ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS playbook      text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS playbook_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_playbook_chk') THEN
    ALTER TABLE public.emails ADD CONSTRAINT emails_playbook_chk
      CHECK (playbook IS NULL OR playbook IN ('conversation', 'invitation', 'introduction', 'pitch'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emails_company ON public.emails (tenant_id, company_id) WHERE company_id IS NOT NULL;

UPDATE public.emails e
SET company_id = p.company_id
FROM public.proposals p
WHERE e.company_id IS NULL AND e.proposal_id = p.id;

UPDATE public.emails
SET playbook = 'pitch'
WHERE playbook IS NULL
  AND direction = 'outbound'
  AND proposal_id IS NOT NULL
  AND COALESCE(flow_type, 'intro') <> 'follow_up';

NOTIFY pgrst, 'reload schema';

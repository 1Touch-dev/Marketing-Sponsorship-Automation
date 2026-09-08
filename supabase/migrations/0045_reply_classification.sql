-- Migration 0045: Reply classification (Phase 2 — "improve the text/email
-- agents", per master_report.md Section 7.2's Negotiation Agent role
-- description). Inbound Gmail replies were detected (email_threads.status
-- flips to 'replied') but never actually stored or read — sync-threads only
-- fetched message *headers*, never the body, and never inserted a row for
-- the inbound message itself. This adds the columns needed to store an
-- AI-generated classification of what an inbound reply actually says, so a
-- human can triage a queue instead of opening every thread cold.

-- New email_status value for inbound messages themselves (distinct from
-- 'sent'/'replied', which describe the OUTBOUND email's own lifecycle).
ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'received';

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS reply_classification TEXT,
  ADD COLUMN IF NOT EXISTS reply_classification_confidence NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS reply_summary TEXT,
  ADD COLUMN IF NOT EXISTS reply_classified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emails_reply_classification_check'
  ) THEN
    ALTER TABLE public.emails
      ADD CONSTRAINT emails_reply_classification_check
      CHECK (
        reply_classification IS NULL OR reply_classification IN (
          'interested', 'objection', 'not_interested', 'needs_info', 'out_of_office', 'other'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS emails_reply_classification_idx ON public.emails(reply_classification);

NOTIFY pgrst, 'reload schema';

-- Migration 0050: E-signature tracking via Documenso hosted API (Task 11).
--
-- Researched 2026-09-17: Documenso's hosted cloud API (app.documenso.com,
-- Teams tier or above for API access) chosen over self-hosting — this box
-- has already had OOM issues and doesn't need another Docker service.
-- Standard advanced e-signature (not ICP-Brasil qualified) is sufficient
-- for private-consent commercial sponsorship contracts under Brazilian
-- law (Lei 14.063/2020); ICP-Brasil is only required for certain
-- regulated/government filings, not this use case.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS documenso_envelope_id   TEXT,
  ADD COLUMN IF NOT EXISTS signature_status         TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (signature_status IN ('not_sent', 'draft', 'pending', 'completed', 'rejected', 'cancelled')),
  ADD COLUMN IF NOT EXISTS signature_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signing_url              TEXT;

NOTIFY pgrst, 'reload schema';

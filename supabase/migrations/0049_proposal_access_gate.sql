-- Migration 0049: Optional NDA/passcode access gate per proposal.
--
-- Competitive research (2026-09-16) found DocSend/Papermark-style platforms
-- commonly offer an optional gate in front of a shared document —
-- passcode, or an NDA the visitor must accept — before the content itself
-- is served. This adds that as an opt-in per-proposal setting; disabled by
-- default, so existing share links keep working unchanged.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS access_gate_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_gate_type     TEXT NOT NULL DEFAULT 'passcode'
    CHECK (access_gate_type IN ('passcode', 'nda')),
  ADD COLUMN IF NOT EXISTS access_gate_passcode TEXT,
  ADD COLUMN IF NOT EXISTS access_gate_nda_text TEXT;

NOTIFY pgrst, 'reload schema';

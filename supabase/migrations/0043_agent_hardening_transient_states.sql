-- Migration 0043: Transient states for infrastructure-enforced approval gates
-- Hardening pass (master_report.md Section 8, Pattern 4 — "approval gates as
-- prompts, not infrastructure"). The outreach agent's approve-and-send
-- transitions were previously check-then-act: read the current status,
-- decide whether to proceed, write the new status back only after the send
-- completed. That left a real race window — two concurrent "Approve & Send"
-- clicks (or a client retry) could both read the pre-send status, both pass
-- the check, and both actually send the same email.
--
-- Fixed in code (lib/agents/tools.ts, lib/agents/resume.ts,
-- app/api/agents/outreach/[runId]/approve/route.ts,
-- app/api/emails/[id]/send/route.ts) to use a single atomic
-- `UPDATE ... WHERE status = <expected>` to claim each transition — only one
-- concurrent caller can ever match the WHERE clause. This migration adds the
-- transient status values those claims need to write:
--   emails.status:      'sending'   (draft/pending_approval/approved -> sending -> sent)
--   agent_runs.status:  'sending'   (paused_for_approval -> sending -> completed)
--                       'resuming'  (paused_for_proposal_approval -> resuming -> paused_for_approval)

-- emails.status is a real Postgres enum type.
ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'sending';

-- agent_runs.status is a text CHECK constraint — widen it to include the two
-- transient values above. Looks up the existing constraint by inspecting
-- pg_constraint rather than assuming its auto-generated name, since that
-- can't be verified against the live DB from this environment.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'agent_runs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_runs DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN (
    'running', 'completed', 'failed', 'cancelled',
    'paused_for_approval', 'paused_for_proposal_approval',
    'sending', 'resuming'
  ));

NOTIFY pgrst, 'reload schema';

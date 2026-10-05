-- Migration 0054: truthful send states and per-recipient signatures (Task 5).
--
-- 1. message_events: an append-only ledger of what actually happened to an
--    email (approved, logged in the CRM, accepted/delivered/opened by an email
--    provider, bounced, outcome unknown, reported by a person). The state shown
--    to people is derived from these facts instead of one ambiguous "sent".
-- 2. contract_signers: one row per signing recipient, so one signer signing a
--    multi-signer contract is not mistaken for the contract being complete.
--
-- Additive only: two new tables.

CREATE TABLE IF NOT EXISTS public.message_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  email_id            uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  event_type          text NOT NULL CHECK (event_type IN (
    'content_approved', 'crm_activity_recorded', 'crm_activity_failed',
    'send_attempted', 'provider_accepted', 'delivered', 'opened', 'clicked',
    'bounced', 'failed', 'outcome_unknown', 'manually_reported_sent', 'reconciled'
  )),
  source              text NOT NULL CHECK (source IN ('platform', 'crm', 'provider', 'manual')),
  provider            text,
  provider_event_id   text,
  provider_receipt_id text,
  actor_user_id       uuid,
  actor_email         text,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- A provider that retries a callback cannot create a second event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_events_provider_event
  ON public.message_events (email_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_events_email
  ON public.message_events (email_id, occurred_at);

CREATE OR REPLACE FUNCTION public.message_events_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'message_events rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.emails WHERE id = OLD.email_id) THEN
      RAISE EXCEPTION 'message_events rows cannot be deleted while their email exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_events_immutable ON public.message_events;
CREATE TRIGGER trg_message_events_immutable
  BEFORE UPDATE OR DELETE ON public.message_events
  FOR EACH ROW EXECUTE FUNCTION public.message_events_immutable();

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_message_events" ON public.message_events;
CREATE POLICY "service_all_message_events" ON public.message_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.contract_signers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contract_id          uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  email                text NOT NULL,
  name                 text,
  role                 text NOT NULL DEFAULT 'signer'
    CHECK (role IN ('signer', 'approver', 'viewer', 'assistant')),
  signing_order        integer,
  required             boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'signed', 'declined')),
  sent_at              timestamptz,
  opened_at            timestamptz,
  signed_at            timestamptz,
  declined_at          timestamptz,
  decline_reason       text,
  provider             text NOT NULL DEFAULT 'documenso',
  provider_recipient_id text,
  last_event_at        timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, email, role)
);

CREATE INDEX IF NOT EXISTS idx_contract_signers_contract
  ON public.contract_signers (contract_id);

ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_contract_signers" ON public.contract_signers;
CREATE POLICY "service_all_contract_signers" ON public.contract_signers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

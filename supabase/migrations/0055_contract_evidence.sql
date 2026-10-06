-- Migration 0055: signature evidence and a verifiable proof trail (Task 6).
--
-- A status badge says what someone set; evidence says what happened. This adds
-- an append-only ledger of contract evidence (terms bound, each signer's
-- actions, envelope completion, the signed document and its hash, a person's
-- claim that it was signed, and a second person's verification), and stores
-- the proposal title on each frozen revision so a revision's checksum can be
-- recomputed by anyone.
--
-- Additive only.

-- 1. A revision must hold everything its checksum covers, or it cannot be re-verified.
ALTER TABLE public.proposal_revisions
  ADD COLUMN IF NOT EXISTS title text;

-- 2. Append-only evidence ledger.
CREATE TABLE IF NOT EXISTS public.contract_evidence (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contract_id            uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  evidence_type          text NOT NULL CHECK (evidence_type IN (
    'revision_bound', 'signer_sent', 'signer_opened', 'signer_signed', 'signer_declined',
    'envelope_completed', 'signed_document', 'activation_claimed',
    'manual_signature_claim', 'manual_verification', 'manual_rejection'
  )),
  source                 text NOT NULL CHECK (source IN ('provider', 'platform', 'manual')),
  signer_email           text,
  revision_id            uuid,
  revision_checksum      text,
  document_sha256        text,
  document_path          text,
  document_url           text,
  references_evidence_id uuid,
  actor_user_id          uuid,
  actor_email            text,
  provider               text,
  provider_event_id      text,
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  recorded_at            timestamptz NOT NULL DEFAULT now(),
  detail                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- A provider that repeats a callback cannot create a second piece of evidence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_evidence_provider_event
  ON public.contract_evidence (contract_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_evidence_contract
  ON public.contract_evidence (contract_id, occurred_at);

CREATE OR REPLACE FUNCTION public.contract_evidence_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'contract_evidence rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.contracts WHERE id = OLD.contract_id) THEN
      RAISE EXCEPTION 'contract_evidence rows cannot be deleted while their contract exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_evidence_immutable ON public.contract_evidence;
CREATE TRIGGER trg_contract_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.contract_evidence
  FOR EACH ROW EXECUTE FUNCTION public.contract_evidence_immutable();

ALTER TABLE public.contract_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_contract_evidence" ON public.contract_evidence;
CREATE POLICY "service_all_contract_evidence" ON public.contract_evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

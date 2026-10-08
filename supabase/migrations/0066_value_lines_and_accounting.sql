-- Migration 0066: cash, barter and savings accounting (Task 18).
--
-- A contract has one number (total_value_brl) and nothing says what it is made of. A barter deal's
-- "value" has been able to read as revenue, and a deal still in draft could be counted as money.
-- This adds the commitment lines behind the number and an append-only settlement ledger:
--
--   value_lines          one row per promised amount: cash (an instalment) or barter (goods or services
--                        the sponsor provides instead of cash). It hangs on a proposal while proposed,
--                        and on the contract once there is one. The SAME row moves from proposed to
--                        contracted, so a deal is never counted twice. An amount cannot be edited;
--                        a wrong line is voided and replaced.
--   value_line_events    invoiced, settled (cash received, or barter goods received) and voided, with a
--                        reference and the date it happened. Money or goods cannot be recorded against
--                        a draft or lapsed contract: drafts are not revenue, enforced here.
--   accounting_settings  the rules James has not yet chosen, as settings with conservative defaults:
--                        how barter is valued, at what stage cash counts as recognised, whether a
--                        contract's total includes barter.
--
-- Realised savings are not a third pile of money: they are what the club would otherwise have paid for
-- barter goods it has actually received. Reports show cash, barter and savings side by side and never
-- add them together. Additive only; nothing is converted automatically.

CREATE TABLE IF NOT EXISTS public.accounting_settings (
  tenant_id               uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  barter_valuation_basis  text NOT NULL DEFAULT 'agreed_value' CHECK (barter_valuation_basis IN ('agreed_value', 'club_reference_value')),
  recognition_stage       text NOT NULL DEFAULT 'settled' CHECK (recognition_stage IN ('contracted', 'invoiced', 'settled')),
  contract_total_covers   text NOT NULL DEFAULT 'cash_and_barter' CHECK (contract_total_covers IN ('cash_only', 'cash_and_barter')),
  barter_tax_note         text,
  updated_by              text NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.value_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  proposal_id          uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id          uuid REFERENCES public.contracts(id),
  kind                 text NOT NULL CHECK (kind IN ('cash', 'barter')),
  label                text NOT NULL CHECK (length(btrim(label)) > 0),
  amount_brl           numeric(14, 2) NOT NULL CHECK (amount_brl > 0),
  currency             text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  due_date             date,
  -- barter only: the club's own wishlist item this satisfies, and what the club would otherwise pay for it
  barter_item_id       uuid REFERENCES public.barter_items(id) ON DELETE SET NULL,
  club_reference_value numeric(14, 2) CHECK (club_reference_value IS NULL OR club_reference_value > 0),
  reference_basis      text CHECK (reference_basis IN ('entered', 'wishlist_price')),
  created_by           text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT value_lines_barter_only_chk CHECK (kind = 'barter' OR (barter_item_id IS NULL AND club_reference_value IS NULL AND reference_basis IS NULL)),
  CONSTRAINT value_lines_reference_chk CHECK ((club_reference_value IS NULL) = (reference_basis IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_value_lines_company ON public.value_lines (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_value_lines_contract ON public.value_lines (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_value_lines_proposal ON public.value_lines (proposal_id) WHERE proposal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.value_line_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  line_id     uuid NOT NULL REFERENCES public.value_lines(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('invoiced', 'settled', 'voided')),
  -- an invoice number, a bank or receipt reference, or a delivery note
  reference   text,
  occurred_on date,
  reason      text,
  actor_email text NOT NULL CHECK (length(btrim(actor_email)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT value_line_events_invoiced_chk CHECK (event_type <> 'invoiced' OR (reference IS NOT NULL AND length(btrim(reference)) >= 3 AND occurred_on IS NOT NULL)),
  CONSTRAINT value_line_events_settled_chk  CHECK (event_type <> 'settled'  OR (reference IS NOT NULL AND length(btrim(reference)) >= 5 AND occurred_on IS NOT NULL)),
  CONSTRAINT value_line_events_voided_chk   CHECK (event_type <> 'voided'   OR (reason IS NOT NULL AND length(btrim(reason)) > 4))
);
CREATE INDEX IF NOT EXISTS idx_value_line_events_line ON public.value_line_events (line_id, created_at DESC);

-- A line has to hang on a proposal or a contract when it is created; afterwards only its contract link
-- may be set (once), or its proposal link cleared when the proposal is removed.
CREATE OR REPLACE FUNCTION public.value_lines_guard() RETURNS trigger AS $$
DECLARE
  c record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proposal_id IS NULL AND NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'a value line belongs to a proposal or a contract';
    END IF;
    IF NEW.contract_id IS NOT NULL THEN
      SELECT company_id, tenant_id INTO c FROM public.contracts WHERE id = NEW.contract_id;
      IF c.company_id IS DISTINCT FROM NEW.company_id OR c.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'that contract does not belong to this company';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'value lines cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.amount_brl IS DISTINCT FROM OLD.amount_brl OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR (NEW.barter_item_id IS DISTINCT FROM OLD.barter_item_id AND NEW.barter_item_id IS NOT NULL)
     OR NEW.club_reference_value IS DISTINCT FROM OLD.club_reference_value OR NEW.reference_basis IS DISTINCT FROM OLD.reference_basis
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR (NEW.proposal_id IS DISTINCT FROM OLD.proposal_id AND NEW.proposal_id IS NOT NULL)
     OR (OLD.contract_id IS NOT NULL AND NEW.contract_id IS DISTINCT FROM OLD.contract_id) THEN
    RAISE EXCEPTION 'a value line''s amount and terms cannot be changed; void it and add a new one';
  END IF;
  IF NEW.contract_id IS NOT NULL AND OLD.contract_id IS NULL THEN
    SELECT company_id, tenant_id INTO c FROM public.contracts WHERE id = NEW.contract_id;
    IF c.company_id IS DISTINCT FROM NEW.company_id OR c.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'that contract does not belong to this company';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_value_lines_guard ON public.value_lines;
CREATE TRIGGER trg_value_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.value_lines
  FOR EACH ROW EXECUTE FUNCTION public.value_lines_guard();

-- The ledger: nothing is edited; money and goods are recorded only against a contract that is in force.
CREATE OR REPLACE FUNCTION public.value_line_events_guard() RETURNS trigger AS $$
DECLARE
  l record;
  cstatus text;
  has_settled boolean;
  has_invoiced boolean;
  has_voided boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'value_line_events rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.value_lines WHERE id = OLD.line_id) THEN
      RAISE EXCEPTION 'value_line_events rows cannot be deleted while their line exists';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO l FROM public.value_lines WHERE id = NEW.line_id;
  SELECT EXISTS (SELECT 1 FROM public.value_line_events WHERE line_id = NEW.line_id AND event_type = 'settled')  INTO has_settled;
  SELECT EXISTS (SELECT 1 FROM public.value_line_events WHERE line_id = NEW.line_id AND event_type = 'invoiced') INTO has_invoiced;
  SELECT EXISTS (SELECT 1 FROM public.value_line_events WHERE line_id = NEW.line_id AND event_type = 'voided')   INTO has_voided;
  IF has_voided THEN
    RAISE EXCEPTION 'this line was voided; nothing more can be recorded against it';
  END IF;
  IF NEW.event_type IN ('invoiced', 'settled') THEN
    IF l.contract_id IS NULL THEN
      RAISE EXCEPTION 'a proposed amount is not revenue: it has to be on a contract before it is invoiced or settled';
    END IF;
    SELECT status INTO cstatus FROM public.contracts WHERE id = l.contract_id;
    IF cstatus IS NULL OR cstatus NOT IN ('active', 'completed', 'expired') THEN
      RAISE EXCEPTION 'the contract is "%", not in force: a draft or lapsed deal is not revenue', COALESCE(cstatus, 'missing');
    END IF;
    IF NEW.occurred_on > CURRENT_DATE THEN
      RAISE EXCEPTION 'that date is in the future; record it when it has happened';
    END IF;
  END IF;
  IF NEW.event_type = 'invoiced' THEN
    IF l.kind <> 'cash' THEN RAISE EXCEPTION 'only a cash line is invoiced'; END IF;
    IF has_invoiced OR has_settled THEN RAISE EXCEPTION 'this line has already been invoiced or settled'; END IF;
  END IF;
  IF NEW.event_type = 'settled' AND has_settled THEN
    RAISE EXCEPTION 'this line has already been settled';
  END IF;
  IF NEW.event_type = 'voided' AND has_settled THEN
    RAISE EXCEPTION 'a settled line cannot be voided: money or goods have already changed hands';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_value_line_events_guard ON public.value_line_events;
CREATE TRIGGER trg_value_line_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.value_line_events
  FOR EACH ROW EXECUTE FUNCTION public.value_line_events_guard();

ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_line_events   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_accounting_settings" ON public.accounting_settings;
CREATE POLICY "service_all_accounting_settings" ON public.accounting_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_value_lines" ON public.value_lines;
CREATE POLICY "service_all_value_lines" ON public.value_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_value_line_events" ON public.value_line_events;
CREATE POLICY "service_all_value_line_events" ON public.value_line_events FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

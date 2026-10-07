-- Migration 0062: contact roles, verified channels, do-not-contact and authorized
-- senders (Task 14).
--
--   contact_roles            who was the decision-maker, billing contact or signatory,
--                            and when; a role is ended, never rewritten
--   contact_channel_checks   append-only: a channel (an email address, a phone) was
--                            verified, bounced or found invalid, by whom and how
--   contact_suppressions     append-only: do not contact this email address or this
--                            company; lifting needs a person and a reason
--   sender_authorizations    append-only: which team member may be named as the
--                            sender of outreach emails
--   emails.sender_member_id  which team member an email is signed as
--
-- Standing is derived from the newest row of each ledger. Additive only.

-- 1. Roles, with history. The only change allowed to a row is ending it, once.
CREATE TABLE IF NOT EXISTS public.contact_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contact_id    uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('decision_maker', 'influencer', 'champion', 'billing', 'signatory', 'legal', 'technical', 'other')),
  started_on    date NOT NULL DEFAULT CURRENT_DATE,
  ended_on      date,
  note          text,
  assigned_by   text NOT NULL,
  ended_by      text,
  end_reason    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on >= started_on),
  CHECK ((ended_on IS NULL) = (ended_by IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_contact_roles_contact ON public.contact_roles (contact_id, started_on DESC);

CREATE OR REPLACE FUNCTION public.contact_roles_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.contacts WHERE id = OLD.contact_id) THEN
      RAISE EXCEPTION 'contact_roles rows cannot be deleted while their contact exists';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: a role may be ended once; nothing else about it may change.
  IF OLD.ended_on IS NOT NULL THEN
    RAISE EXCEPTION 'this role has already ended';
  END IF;
  IF NEW.ended_on IS NULL
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.started_on IS DISTINCT FROM OLD.started_on OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.note IS DISTINCT FROM OLD.note OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a role can only be ended; its history cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_roles_guard ON public.contact_roles;
CREATE TRIGGER trg_contact_roles_guard
  BEFORE UPDATE OR DELETE ON public.contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.contact_roles_guard();

-- 2. Channel checks.
CREATE TABLE IF NOT EXISTS public.contact_channel_checks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email', 'phone', 'linkedin', 'whatsapp')),
  value      text NOT NULL CHECK (length(btrim(value)) > 0),
  outcome    text NOT NULL CHECK (outcome IN ('verified', 'bounced', 'invalid')),
  method     text NOT NULL CHECK (method IN ('person', 'delivery_event', 'enrichment')),
  checked_by text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_channel_checks_value ON public.contact_channel_checks (tenant_id, channel, lower(value), created_at DESC);

-- 3. Do not contact. One subject per row: an email address or a whole company.
CREATE TABLE IF NOT EXISTS public.contact_suppressions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  subject_kind text NOT NULL CHECK (subject_kind IN ('email', 'company')),
  email        text,
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  decision     text NOT NULL CHECK (decision IN ('suppressed', 'lifted')),
  reason_code  text NOT NULL CHECK (reason_code IN ('asked_to_stop', 'complaint', 'bounce', 'wrong_person', 'client_request', 'internal_decision', 'other')),
  note         text,
  actor_kind   text NOT NULL CHECK (actor_kind IN ('human', 'system')),
  actor        text NOT NULL,
  source       text NOT NULL DEFAULT 'manual',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (subject_kind = 'email'   AND email IS NOT NULL AND email = lower(email) AND company_id IS NULL)
    OR (subject_kind = 'company' AND company_id IS NOT NULL AND email IS NULL)
  ),
  -- Only a person can lift a suppression, and must say why.
  CHECK (decision = 'suppressed' OR (actor_kind = 'human' AND note IS NOT NULL AND length(btrim(note)) > 4))
);
CREATE INDEX IF NOT EXISTS idx_contact_suppressions_email ON public.contact_suppressions (tenant_id, email, created_at DESC) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_suppressions_company ON public.contact_suppressions (tenant_id, company_id, created_at DESC) WHERE company_id IS NOT NULL;

-- 4. Authorized senders: which team member may be named as the sender.
CREATE TABLE IF NOT EXISTS public.sender_authorizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  decision       text NOT NULL CHECK (decision IN ('granted', 'revoked')),
  actor_kind     text NOT NULL CHECK (actor_kind IN ('human', 'grandfathered')),
  actor          text NOT NULL,
  reason         text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sender_authorizations_member ON public.sender_authorizations (team_member_id, created_at DESC);

-- 5. Ledgers cannot be edited or deleted (except by removing their parent).
CREATE OR REPLACE FUNCTION public.contact_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_channel_checks_immutable ON public.contact_channel_checks;
CREATE TRIGGER trg_contact_channel_checks_immutable BEFORE UPDATE ON public.contact_channel_checks
  FOR EACH ROW EXECUTE FUNCTION public.contact_ledger_immutable();
DROP TRIGGER IF EXISTS trg_contact_suppressions_immutable ON public.contact_suppressions;
CREATE TRIGGER trg_contact_suppressions_immutable BEFORE UPDATE ON public.contact_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.contact_ledger_immutable();
DROP TRIGGER IF EXISTS trg_sender_authorizations_immutable ON public.sender_authorizations;
CREATE TRIGGER trg_sender_authorizations_immutable BEFORE UPDATE ON public.sender_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.contact_ledger_immutable();

-- A suppression must outlive the person it is about, so it cannot be deleted while its tenant
-- exists (and, for a company, while the company exists: removing the company removes its rows).
-- Updates are blocked above for every ledger; only suppressions are also protected from deletes,
-- because losing one could mean contacting someone who asked us to stop.
CREATE OR REPLACE FUNCTION public.contact_suppressions_no_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id)
     AND (OLD.company_id IS NULL OR EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id)) THEN
    RAISE EXCEPTION 'contact_suppressions rows cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_contact_suppressions_no_delete ON public.contact_suppressions;
CREATE TRIGGER trg_contact_suppressions_no_delete BEFORE DELETE ON public.contact_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.contact_suppressions_no_delete();

ALTER TABLE public.contact_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_channel_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_suppressions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_authorizations  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_contact_roles" ON public.contact_roles;
CREATE POLICY "service_all_contact_roles" ON public.contact_roles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_contact_channel_checks" ON public.contact_channel_checks;
CREATE POLICY "service_all_contact_channel_checks" ON public.contact_channel_checks FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_contact_suppressions" ON public.contact_suppressions;
CREATE POLICY "service_all_contact_suppressions" ON public.contact_suppressions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_sender_authorizations" ON public.sender_authorizations;
CREATE POLICY "service_all_sender_authorizations" ON public.sender_authorizations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Which team member an email is signed as.
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS sender_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 7. Backfill. The active default sender has been signing every email, so it is authorized
-- ('grandfathered'). Nobody else is: a person has to grant it.
INSERT INTO public.sender_authorizations (tenant_id, team_member_id, decision, actor_kind, actor, reason)
SELECT t.tenant_id, t.id, 'granted', 'grandfathered', 'migration-0062',
       'Was the active default sender, and already signs outreach emails, before authorization was tracked.'
FROM public.team_members t
WHERE t.active AND t.default_sender
  AND NOT EXISTS (SELECT 1 FROM public.sender_authorizations a WHERE a.team_member_id = t.id);

NOTIFY pgrst, 'reload schema';

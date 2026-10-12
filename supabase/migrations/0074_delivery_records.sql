-- Migration 0074: the delivery records the sponsor screens need (Priority 8).
--
--   1. a match on an obligation, so delivery work can be grouped around a match
--   2. a sponsor's acceptance of delivered work, recorded on its own (it does not replace the club's internal acceptance
--      until James decides that, T16-04)
--   3. proof files that are really stored, so "file" proof points at something and a pack can be assembled from it
--   4. versions of a sponsor's logo, and a link from each generated image to the version it used, so replacing a logo
--      leaves the old one on record and shows which images are now out of date
--
-- Additive only. Nothing existing is changed or converted, except that every logo already on a company is recorded as its
-- version 1.

-- ═══ 1. a match on an obligation ═══════════════════════════════════════════════════════════════════
-- Optional, and it does not move any date: how sold items are dated (the contract end date, or their own dates) is still
-- James's decision (T16-02). This only lets the work be grouped around a match.
ALTER TABLE public.obligations ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_obligations_match ON public.obligations (tenant_id, match_id) WHERE match_id IS NOT NULL;

-- ═══ 3. proof files (before 2, which points at proof) ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.obligation_proof_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'obligation-proof',
  storage_path  text NOT NULL UNIQUE,
  file_name     text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 200),
  content_type  text,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  sha256        text NOT NULL CHECK (length(sha256) = 64),
  uploaded_by   text NOT NULL CHECK (length(btrim(uploaded_by)) > 0),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_obligation_proof_files_obligation ON public.obligation_proof_files (obligation_id, created_at);

CREATE OR REPLACE FUNCTION public.obligation_proof_files_guard() RETURNS trigger AS $$
DECLARE
  o public.obligations;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'obligation_proof_files rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.obligations WHERE id = OLD.obligation_id) THEN RAISE EXCEPTION 'proof files cannot be deleted while their obligation exists'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO o FROM public.obligations WHERE id = NEW.obligation_id;
  IF NOT FOUND OR o.tenant_id <> NEW.tenant_id OR o.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'a proof file belongs to the obligation''s own club and sponsor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_obligation_proof_files_guard ON public.obligation_proof_files;
CREATE TRIGGER trg_obligation_proof_files_guard BEFORE INSERT OR UPDATE OR DELETE ON public.obligation_proof_files FOR EACH ROW EXECUTE FUNCTION public.obligation_proof_files_guard();

-- "file" proof must be a stored file of that obligation. (No obligation exists in production yet, so nothing is converted.)
CREATE OR REPLACE FUNCTION public.obligation_events_file_proof_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.event_type = 'evidenced' AND NEW.evidence_kind = 'file' THEN
    IF NEW.evidence_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM public.obligation_proof_files f WHERE f.id = NEW.evidence_ref::uuid AND f.obligation_id = NEW.obligation_id) THEN
      RAISE EXCEPTION 'file proof has to be a file that was uploaded for this obligation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_obligation_events_file_proof_guard ON public.obligation_events;
CREATE TRIGGER trg_obligation_events_file_proof_guard BEFORE INSERT ON public.obligation_events FOR EACH ROW EXECUTE FUNCTION public.obligation_events_file_proof_guard();

ALTER TABLE public.obligation_proof_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_obligation_proof_files" ON public.obligation_proof_files;
CREATE POLICY "service_all_obligation_proof_files" ON public.obligation_proof_files FOR ALL TO service_role USING (true) WITH CHECK (true);

-- A private place for the files (where Supabase storage exists).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('obligation-proof', 'obligation-proof', false) ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not create the obligation-proof bucket here (%): create a PRIVATE bucket with that name in Storage', SQLERRM;
END $$;

-- ═══ 2. a sponsor's acceptance ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.obligation_sponsor_acceptances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  obligation_id  uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- the proof the sponsor was shown and accepted
  proof_event_id uuid NOT NULL REFERENCES public.obligation_events(id) ON DELETE CASCADE,
  accepted_by    text NOT NULL CHECK (accepted_by = lower(accepted_by) AND length(btrim(accepted_by)) > 3),
  note           text CHECK (note IS NULL OR length(note) <= 1000),
  accepted_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_sponsor_acceptance UNIQUE (obligation_id, proof_event_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_acceptances_company ON public.obligation_sponsor_acceptances (tenant_id, company_id, accepted_at DESC);

CREATE OR REPLACE FUNCTION public.obligation_sponsor_acceptances_guard() RETURNS trigger AS $$
DECLARE
  o public.obligations;
  ev public.obligation_events;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'obligation_sponsor_acceptances rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.obligations WHERE id = OLD.obligation_id) THEN RAISE EXCEPTION 'a sponsor''s acceptance cannot be deleted while its obligation exists'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO o FROM public.obligations WHERE id = NEW.obligation_id;
  IF NOT FOUND OR o.tenant_id <> NEW.tenant_id OR o.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'a sponsor can only accept work of its own';
  END IF;
  SELECT * INTO ev FROM public.obligation_events WHERE id = NEW.proof_event_id;
  IF NOT FOUND OR ev.obligation_id <> NEW.obligation_id OR ev.event_type <> 'evidenced' THEN
    RAISE EXCEPTION 'a sponsor accepts delivery by accepting its proof';
  END IF;
  -- it has to be the proof as it stands now: not superseded by newer proof, and not reopened or waived since
  IF EXISTS (SELECT 1 FROM public.obligation_events e WHERE e.obligation_id = NEW.obligation_id AND e.event_type IN ('evidenced', 'reopened', 'waived') AND e.created_at > ev.created_at) THEN
    RAISE EXCEPTION 'that proof is no longer current';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_obligation_sponsor_acceptances_guard ON public.obligation_sponsor_acceptances;
CREATE TRIGGER trg_obligation_sponsor_acceptances_guard BEFORE INSERT OR UPDATE OR DELETE ON public.obligation_sponsor_acceptances FOR EACH ROW EXECUTE FUNCTION public.obligation_sponsor_acceptances_guard();

ALTER TABLE public.obligation_sponsor_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_obligation_sponsor_acceptances" ON public.obligation_sponsor_acceptances;
CREATE POLICY "service_all_obligation_sponsor_acceptances" ON public.obligation_sponsor_acceptances FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══ 4. logo versions ═════════════════════════════════════════════════════════════════════════════
-- Every time a company's logo changes, by any route, the new one is recorded as the next version. The old rows stay.
-- `stored_path` is filled in afterwards, once the image itself has been copied into our storage (the URL alone can
-- disappear from the other site).
CREATE TABLE IF NOT EXISTS public.company_logo_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  logo_url       text NOT NULL,
  source         text,
  stored_path    text,
  sha256         text CHECK (sha256 IS NULL OR length(sha256) = 64),
  content_type   text,
  size_bytes     bigint,
  archived_at    timestamptz,
  archive_error  text,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_company_logo_versions_company ON public.company_logo_versions (company_id, version_number DESC);

CREATE OR REPLACE FUNCTION public.company_logo_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN RAISE EXCEPTION 'logo versions cannot be deleted while their company exists'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- the only thing that happens to a version afterwards is that its image is archived, once
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number OR NEW.logo_url IS DISTINCT FROM OLD.logo_url OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (OLD.stored_path IS NOT NULL AND NEW.stored_path IS DISTINCT FROM OLD.stored_path)
       OR (OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256) THEN
      RAISE EXCEPTION 'a logo version is a record of what was used; only its archive details can be filled in';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_logo_versions_guard ON public.company_logo_versions;
CREATE TRIGGER trg_company_logo_versions_guard BEFORE UPDATE OR DELETE ON public.company_logo_versions FOR EACH ROW EXECUTE FUNCTION public.company_logo_versions_guard();

ALTER TABLE public.company_logo_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_company_logo_versions" ON public.company_logo_versions;
CREATE POLICY "service_all_company_logo_versions" ON public.company_logo_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Recorded by the database, so it does not matter which code path changed the logo.
CREATE OR REPLACE FUNCTION public.companies_record_logo_version() RETURNS trigger AS $$
BEGIN
  IF NEW.logo_url IS NULL OR btrim(NEW.logo_url) = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.logo_url IS NOT DISTINCT FROM OLD.logo_url THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('logo:' || NEW.id::text));
  INSERT INTO public.company_logo_versions (tenant_id, company_id, version_number, logo_url, source)
  VALUES (NEW.tenant_id, NEW.id, COALESCE((SELECT max(version_number) FROM public.company_logo_versions WHERE company_id = NEW.id), 0) + 1, NEW.logo_url, to_jsonb(NEW)->>'logo_source');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_companies_record_logo_version ON public.companies;
CREATE TRIGGER trg_companies_record_logo_version AFTER INSERT OR UPDATE OF logo_url ON public.companies FOR EACH ROW EXECUTE FUNCTION public.companies_record_logo_version();

-- Every logo already on a company is its version 1.
INSERT INTO public.company_logo_versions (tenant_id, company_id, version_number, logo_url, source)
SELECT c.tenant_id, c.id, 1, c.logo_url, to_jsonb(c)->>'logo_source'
FROM public.companies c
WHERE c.logo_url IS NOT NULL AND btrim(c.logo_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.company_logo_versions v WHERE v.company_id = c.id);

-- Which version of the logo a generated image was made from. Images made before this have none, so whether they are out of
-- date is unknown, not "no".
ALTER TABLE public.image_generation_jobs ADD COLUMN IF NOT EXISTS source_logo_version_id uuid REFERENCES public.company_logo_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_img_jobs_logo_version ON public.image_generation_jobs (source_logo_version_id) WHERE source_logo_version_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

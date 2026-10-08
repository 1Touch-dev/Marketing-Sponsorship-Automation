-- Migration 0067: sponsor recap reconciliation (Task 19).
--
-- After delivery, what was sold, scheduled, delivered, evidenced and accepted is reconciled into one
-- recap per contract. The live recap is derived from obligations, their proof and the recorded reach;
-- this table keeps the versions that were ISSUED, so what a sponsor was told can always be shown again.
--
--   sponsor_recaps   append-only. One row per issued version of a contract's recap: the whole reconciled
--                    recap as it stood (content), a checksum of it, who issued it, and the gaps that were
--                    open at the time. A recap with gaps can only be issued by someone who acknowledges them.
--
-- The recap keeps two lists apart: "measured" (from recorded evidence, each with a source) and
-- "modeled" (estimates made before delivery, such as an AI-written reach estimate). The database
-- refuses a row where a modeled figure sits in the measured list, or a measured figure has no source.
--
-- Additive only. Nothing is issued automatically.

CREATE TABLE IF NOT EXISTS public.sponsor_recaps (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id        uuid NOT NULL REFERENCES public.contracts(id),
  version            integer NOT NULL CHECK (version >= 1),
  status             text NOT NULL CHECK (status IN ('complete', 'ready_with_gaps', 'in_progress')),
  period_start       date,
  period_end         date,
  gap_count          integer NOT NULL CHECK (gap_count >= 0),
  blocking_gap_count integer NOT NULL CHECK (blocking_gap_count >= 0 AND blocking_gap_count <= gap_count),
  gaps_acknowledged  boolean NOT NULL DEFAULT false,
  acknowledgement    text,
  issued_by          text NOT NULL CHECK (length(btrim(issued_by)) > 0),
  issued_at          timestamptz NOT NULL DEFAULT now(),
  content            jsonb NOT NULL,
  checksum           text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_sponsor_recaps_version UNIQUE (contract_id, version),
  -- gaps are never issued silently
  CONSTRAINT sponsor_recaps_gaps_chk CHECK (
    gap_count = 0 OR (gaps_acknowledged AND acknowledgement IS NOT NULL AND length(btrim(acknowledgement)) >= 10)
  ),
  CONSTRAINT sponsor_recaps_shape_chk CHECK (
    coalesce(jsonb_typeof(content), '') = 'object'
    AND coalesce(jsonb_typeof(content->'measured'), '') = 'array' AND coalesce(jsonb_typeof(content->'modeled'), '') = 'array'
    AND coalesce(jsonb_typeof(content->'gaps'), '') = 'array' AND coalesce(jsonb_typeof(content->'commitments'), '') = 'object'
  )
);
CREATE INDEX IF NOT EXISTS idx_sponsor_recaps_company ON public.sponsor_recaps (tenant_id, company_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.sponsor_recaps_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'issued recaps are immutable; issue a new version instead';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'issued recaps cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  -- INSERT: an estimate must never be shown as a result.
  IF coalesce(jsonb_typeof(NEW.content->'measured'), '') <> 'array' OR coalesce(jsonb_typeof(NEW.content->'modeled'), '') <> 'array' THEN
    RAISE EXCEPTION 'a recap needs a measured list and a modeled list';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.content->'measured') e
    WHERE e->>'basis' IS DISTINCT FROM 'measured' OR coalesce(btrim(e->>'source'), '') = ''
  ) THEN
    RAISE EXCEPTION 'every measured figure needs its source, and only measured figures belong in that list';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.content->'modeled') e
    WHERE e->>'basis' IS DISTINCT FROM 'modeled'
  ) THEN
    RAISE EXCEPTION 'the modeled list holds only modeled figures';
  END IF;
  IF (SELECT company_id FROM public.contracts WHERE id = NEW.contract_id) IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'that contract does not belong to this company';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sponsor_recaps_guard ON public.sponsor_recaps;
CREATE TRIGGER trg_sponsor_recaps_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sponsor_recaps
  FOR EACH ROW EXECUTE FUNCTION public.sponsor_recaps_guard();

ALTER TABLE public.sponsor_recaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_sponsor_recaps" ON public.sponsor_recaps;
CREATE POLICY "service_all_sponsor_recaps" ON public.sponsor_recaps FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Migration 0056: claim provenance registry (Task 8).
--
-- Any figure a sponsor can see (follower counts, attendance, population,
-- broadcast partners...) is a claim. Before this, those figures were typed
-- into the deck page, the KPI templates and an AI prompt constant with no
-- source, no date and no owner, and they disagreed with each other.
--
--   claims          the identity of one claim ("club.avg_attendance")
--   claim_versions  immutable: the value, its source, effective date, expiry
--                   and owner. Changing a figure is a new version.
--   claim_reviews   append-only: a person verified or disputed one version.
--
-- Whether a claim may appear in a sponsor-facing document is derived from
-- those facts in code (lib/claims/status.ts): verified, sourced, owned,
-- in date. A new version has no review yet, so an edited figure must be
-- re-verified before it is shown again.
--
-- Additive only. Existing rows in coritiba_metrics are copied in as
-- UNREVIEWED versions: nobody has verified them, so they are not usable until
-- someone does.

-- 1. Claim identity.
CREATE TABLE IF NOT EXISTS public.claims (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  key        text NOT NULL,
  category   text NOT NULL DEFAULT 'general',
  label      text NOT NULL,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

-- 2. Immutable versions.
CREATE TABLE IF NOT EXISTS public.claim_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  claim_id         uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  version          integer NOT NULL CHECK (version >= 1),
  value            text NOT NULL,
  unit             text,
  description      text,
  source_kind      text NOT NULL DEFAULT 'unknown' CHECK (source_kind IN (
    'official_club', 'public_statistics', 'third_party_report', 'internal_estimate', 'unknown'
  )),
  source_ref       text,
  source_url       text,
  effective_date   date,
  expires_at       date,
  owner            text,
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, version),
  CHECK (expires_at IS NULL OR effective_date IS NULL OR expires_at >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_claim_versions_claim ON public.claim_versions (claim_id, version DESC);

-- 3. Append-only reviews.
CREATE TABLE IF NOT EXISTS public.claim_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  claim_id         uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  claim_version_id uuid NOT NULL REFERENCES public.claim_versions(id) ON DELETE CASCADE,
  decision         text NOT NULL CHECK (decision IN ('verified', 'disputed')),
  reviewer_user_id uuid,
  reviewer_email   text,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_reviews_version ON public.claim_reviews (claim_version_id, created_at DESC);

-- 4. Versions and reviews cannot be changed or deleted, except by deleting the
--    claim itself (the cascade removes the parent first, then the children).
CREATE OR REPLACE FUNCTION public.claim_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.claims WHERE id = OLD.claim_id) THEN
      RAISE EXCEPTION '% rows cannot be deleted while their claim exists', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_versions_immutable ON public.claim_versions;
CREATE TRIGGER trg_claim_versions_immutable
  BEFORE UPDATE OR DELETE ON public.claim_versions
  FOR EACH ROW EXECUTE FUNCTION public.claim_ledger_immutable();

DROP TRIGGER IF EXISTS trg_claim_reviews_immutable ON public.claim_reviews;
CREATE TRIGGER trg_claim_reviews_immutable
  BEFORE UPDATE OR DELETE ON public.claim_reviews
  FOR EACH ROW EXECUTE FUNCTION public.claim_ledger_immutable();

ALTER TABLE public.claims         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_reviews  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_claims" ON public.claims;
CREATE POLICY "service_all_claims" ON public.claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_claim_versions" ON public.claim_versions;
CREATE POLICY "service_all_claim_versions" ON public.claim_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_claim_reviews" ON public.claim_reviews;
CREATE POLICY "service_all_claim_reviews" ON public.claim_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Backfill from coritiba_metrics. The seed ran twice (18 May and 17 Jul),
--    so every metric exists twice; the newest row of each is used. Metrics that
--    sponsor documents already show map onto stable claim keys; the rest get a
--    generated key. Every row is copied as an unreviewed version 1.
DO $$
BEGIN
  IF to_regclass('public.coritiba_metrics') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _claim_seed ON COMMIT DROP AS
  WITH latest AS (
    SELECT DISTINCT ON (tenant_id, category, metric_name)
           tenant_id, category, metric_name, metric_value, unit, description, source
    FROM public.coritiba_metrics
    WHERE status = 'active' AND tenant_id IS NOT NULL
    ORDER BY tenant_id, category, metric_name, updated_at DESC
  )
  SELECT l.*,
         COALESCE(
           m.claim_key,
           'metric.' || l.category || '.' ||
             trim(both '_' from regexp_replace(lower(l.metric_name), '[^a-z0-9]+', '_', 'g'))
         ) AS claim_key
  FROM latest l
  LEFT JOIN (VALUES
    ('club',      'Club founded',                      'club.founded_year'),
    ('club',      'Stadium — Couto Pereira capacity',  'club.stadium_capacity'),
    ('club',      'Average matchday attendance',       'club.avg_attendance'),
    ('fanbase',   'Social media total followers',      'club.social_followers_total'),
    ('city',      'Greater Curitiba area population',  'city.metro_population'),
    ('broadcast', 'National TV broadcast',             'club.broadcast_partners')
  ) AS m(category, metric_name, claim_key)
    ON m.category = l.category AND m.metric_name = l.metric_name;

  INSERT INTO public.claims (tenant_id, key, category, label)
  SELECT tenant_id, claim_key, category, metric_name FROM _claim_seed
  ON CONFLICT (tenant_id, key) DO NOTHING;

  INSERT INTO public.claim_versions
    (tenant_id, claim_id, version, value, unit, description, source_kind, source_ref, created_by_email)
  SELECT s.tenant_id, c.id, 1, s.metric_value, NULLIF(s.unit, ''),
         concat_ws(' ', s.description,
           CASE s.claim_key
             WHEN 'club.avg_attendance' THEN
               'CONFLICT: the deck page said 23 mil, the KPI templates 25.000–36.000, the AI prompt 15,000–30,000. Reviewer must pick one figure.'
             WHEN 'club.social_followers_total' THEN
               'NOTE: the per-platform rows below add up to 1.35M+ before X/Twitter; the AI prompt said ~1.5M+ across platforms.'
           END),
         'unknown', NULLIF(s.source, ''), 'migration-0056'
  FROM _claim_seed s
  JOIN public.claims c ON c.tenant_id = s.tenant_id AND c.key = s.claim_key
  ON CONFLICT (claim_id, version) DO NOTHING;
END $$;

-- 6. Figures that were hardcoded in the deck page and KPI templates and have no
--    row in coritiba_metrics. Copied as unreviewed; where two places disagreed
--    the description says so, so the reviewer sees it.
DO $$
DECLARE
  t uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _doc_seed (key text, category text, label text, value text, description text, source_ref text) ON COMMIT DROP;
  INSERT INTO _doc_seed VALUES
    ('club.members',               'club',   'Sócios torcedores',                    '36 mil',
       'Deck page said 36 mil (goal of 40 mil for the year); the KPI templates said 38.000+. Reviewer must pick one.',
       'Deck page footnote: Bentview · Horizm · Coxa iD · Fan Base'),
    ('club.coxa_id_fans',          'fanbase','Torcedores identificados no Coxa iD',  '204 mil',
       'Hardcoded in the deck page.',
       'Deck page footnote: Bentview · Horizm · Coxa iD · Fan Base'),
    ('club.social_reach_cumulative','fanbase','Alcance acumulado nas redes oficiais', '231 mi',
       'Hardcoded in the deck page. A cumulative reach figure, not a follower count.',
       'Deck page footnote: Bentview · Horizm · Coxa iD · Fan Base'),
    ('club.matchday_views',        'fanbase','Views acumulados no Matchday',          '320 mi',
       'Hardcoded in the deck page.',
       'Deck page footnote: Bentview · Horizm · Coxa iD · Fan Base'),
    ('city.idh',                   'city',   'IDH de Curitiba',                       '0,823',
       'Hardcoded in the KPI templates with the unsourced claim "Maior IDH do Sul", which is no longer shown.',
       NULL),
    ('club.competitions_season',   'club',   'Competições da temporada',               'Série A + Copa do Brasil + Campeonato Paranaense',
       'Hardcoded in the landing page and KPI templates as "Competições 2026". Season-bound, so it needs an expiry.',
       NULL),
    ('club.vip_boxes',             'club',   'Camarotes',                              '58',
       'Hardcoded in the deck page ("camarotes com TVs e catering premium").',
       NULL),
    ('club.points_of_sale',        'club',   'Pontos de venda ativados por jogo',      '89',
       'Hardcoded in the deck page ("89 PDVs ... a cada jogo").',
       NULL),
    ('club.partner_brands',        'club',   'Marcas parceiras',                       'Heineken, Ambev, Banco Itaú, Toyota, Red Bull, Claro, TIM',
       'Shown to sponsors as "Marcas que confiam no clube". Red Bull and Heineken are also used in the AI prompt as GLOBAL inspiration examples, not club partners. Each name must be confirmed as a real partner before this is verified.',
       NULL);

  INSERT INTO public.claims (tenant_id, key, category, label)
  SELECT t, key, category, label FROM _doc_seed
  ON CONFLICT (tenant_id, key) DO NOTHING;

  INSERT INTO public.claim_versions
    (tenant_id, claim_id, version, value, description, source_kind, source_ref, created_by_email)
  SELECT t, c.id, 1, s.value, s.description, 'unknown', s.source_ref, 'migration-0056'
  FROM _doc_seed s
  JOIN public.claims c ON c.tenant_id = t AND c.key = s.key
  ON CONFLICT (claim_id, version) DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';

-- Migration 0057: proposed content corrections for the claims registry (Task 9).
--
-- Data only. Every row written here is an UNREVIEWED proposal by
-- 'task-9-research': the registry never shows a figure to a sponsor until a
-- person other than the author verifies it, and no owner is set, so a person
-- must also take ownership. Nothing a sponsor sees changes when this runs.
--
-- Evidence was gathered from public sources on 2026-10-06 (links on each row).
-- Where the evidence was thin or contradictory the row says so instead of
-- guessing, and some figures (average attendance, follower counts) are
-- deliberately NOT proposed because the sources conflict.
--
-- Idempotent: running it twice adds nothing the second time.

DO $$
DECLARE
  t uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t)
     OR to_regclass('public.claim_versions') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _fix (
    key text, category text, label text,
    value text, unit text, description text,
    source_kind text, source_ref text, source_url text,
    effective_date date, expires_at date
  ) ON COMMIT DROP;

  INSERT INTO _fix VALUES
  -- ── Corrections to figures already in the registry (become version 2) ──────
  ('metric.club.national_championship_titles', 'club', 'National championship titles',
   '1', 'título',
   'Campeonato Brasileiro Série A 1985. CORRECTS version 1 ("2", "Campeão Brasileiro 1985 e 1990"): the 1990 Série A was won by Corinthians, not Coritiba. Any other national title (for example a Série B) must be recorded as its own, named claim.',
   'third_party_report',
   'Lance! "Coritiba campeão brasileiro de 1985"; Wikipedia "1990 Campeonato Brasileiro Série A" (champion: Corinthians)',
   'https://www.lance.com.br/lancepedia/coritiba-campeao-brasileiro-de-1985.html',
   DATE '2026-10-06', DATE '2027-10-06'),

  ('metric.club.home_matches_per_season', 'club', 'Home matches per season',
   '19', 'jogos em casa (Campeonato Brasileiro)',
   'CORRECTS version 1 ("38+"): 38 is the number of league rounds, home and away together, so a club plays 19 league matches at home. Home matches in the Copa do Brasil and the Campeonato Paranaense come on top and vary by year; state them separately if wanted.',
   'third_party_report',
   'Lance! "Coritiba lota o Couto Pereira" (19 jogos em casa na temporada de liga)',
   'https://www.lance.com.br/coritiba/coritiba-lota-o-couto-pereira-e-lidera-media-de-publico-na-serie-b.html',
   DATE '2026-10-06', DATE '2027-10-06'),

  -- ── Same values, now with a source and dates so they can be verified ───────
  ('club.stadium_capacity', 'club', 'Stadium — Couto Pereira capacity',
   '40.502', 'lugares',
   'Official capacity. Press reports say fire-department and military-police limits currently allow about 38,000; decide which figure sponsors should be quoted.',
   'third_party_report',
   'Wikipedia "Estádio Couto Pereira"; Tribuna PR; StadiumDB',
   'https://en.wikipedia.org/wiki/Est%C3%A1dio_Couto_Pereira',
   DATE '2026-10-06', DATE '2027-10-06'),

  ('club.founded_year', 'club', 'Club founded',
   '1909', NULL,
   'Founded 12 October 1909 at a meeting in the Theatro Hauer; officially formed as Coritibano Foot Ball Club on 30 January 1910.',
   'third_party_report',
   'Wikipedia "Coritiba Foot Ball Club"; Band Paraná',
   'https://en.wikipedia.org/wiki/Coritiba_Foot_Ball_Club',
   DATE '2026-10-06', DATE '2027-10-06'),

  -- ── Incentive-law claims (new) ─────────────────────────────────────────────
  ('law.esporte.pj_deduction_cap', 'law', 'Lei de Incentivo ao Esporte — company deduction limit',
   '1% do imposto devido (pessoa jurídica, por período de apuração)', NULL,
   'Lei nº 11.438/2006 art. 1, as amended by Lei nº 11.472/2007: patrocínio and doação to approved sports projects may be deducted from the tax owed up to 1% (pessoa jurídica). CORRECTS the proposal template, which said "dedução de até 100% do valor investido": the limit is a percentage of the tax owed, not of the amount invested. The same text says these amounts cannot also be deducted as an expense when working out lucro real or CSLL. VERIFY BEFORE USE: the compilation retrieved says the incentive ran 2007 to 2015; the law has since been extended, so confirm the current validity window against the official text.',
   'third_party_report',
   'Lei 11.438/2006 (compilação ICNL, com alterações até a Lei 11.472/2007); texto oficial no Planalto a confirmar',
   'https://www.icnl.org/research/library/brazil_law11438/',
   DATE '2007-01-01', DATE '2026-12-31'),

  ('law.esporte.pf_deduction_cap', 'law', 'Lei de Incentivo ao Esporte — individual deduction limit',
   '6% do imposto devido (pessoa física, Declaração de Ajuste Anual)', NULL,
   'Same law and caveats as law.esporte.pj_deduction_cap; this is the limit for individuals.',
   'third_party_report',
   'Lei 11.438/2006 (compilação ICNL, com alterações até a Lei 11.472/2007); texto oficial no Planalto a confirmar',
   'https://www.icnl.org/research/library/brazil_law11438/',
   DATE '2007-01-01', DATE '2026-12-31'),

  ('law.rouanet.pj_deduction_cap', 'law', 'Lei Rouanet — company deduction limit',
   '4% do imposto devido (pessoa jurídica tributada pelo lucro real)', NULL,
   'Lei nº 8.313/1991 art. 18. The page used to say "4–6% of IR"; for companies the limit reported by secondary sources is 4%, and 6% is an individual figure. LOWER CONFIDENCE: the official text could not be retrieved, so this rests on a legal article. A reviewer must check art. 18 of Lei 8.313/1991 and the current rules of the Ministério da Cultura.',
   'third_party_report',
   'jus.com.br "A Lei Rouanet e os incentivos fiscais"; texto oficial no Planalto a confirmar',
   'https://jus.com.br/artigos/15080/a-lei-rouanet-e-os-incentivos-fiscais',
   DATE '2026-10-06', DATE '2026-12-31');

  -- New claims
  INSERT INTO public.claims (tenant_id, key, category, label)
  SELECT t, f.key, f.category, f.label FROM _fix f
  ON CONFLICT (tenant_id, key) DO NOTHING;

  -- Next version of each claim, only when its newest version is not already this proposal.
  INSERT INTO public.claim_versions
    (tenant_id, claim_id, version, value, unit, description, source_kind, source_ref, source_url,
     effective_date, expires_at, owner, created_by_email)
  SELECT t, c.id,
         COALESCE((SELECT max(v.version) FROM public.claim_versions v WHERE v.claim_id = c.id), 0) + 1,
         f.value, f.unit, f.description, f.source_kind, f.source_ref, f.source_url,
         f.effective_date, f.expires_at, NULL, 'task-9-research'
  FROM _fix f
  JOIN public.claims c ON c.tenant_id = t AND c.key = f.key
  WHERE NOT EXISTS (
    SELECT 1 FROM public.claim_versions v
    WHERE v.claim_id = c.id AND v.created_by_email = 'task-9-research'
  );
END $$;

NOTIFY pgrst, 'reload schema';

-- Migration 0042: Matches, per-match media reach, and CRM warm-up strategies
-- James (21 Aug 2026, via Abhishek): "make proposals for the per match" + "add a
-- module to add the Expected Views per match of all posts official, non
-- official, fan accounts, rival accounts, media and TV or radio (based on past
-- game stats) — we need to be able to edit it" + "add into the crm a warm up
-- strategy we can create, to invite the CMO of a company to a match, have
-- dinner, than send a proposal."
--
-- Additive + idempotent, same conventions as prior migrations (0038, 0041).

-- ─── 1. Matches (fixtures) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_date   DATE NOT NULL,
  opponent     TEXT NOT NULL,
  competition  TEXT,                 -- e.g. "Brasileirão", "Copa do Brasil"
  home_away    TEXT NOT NULL DEFAULT 'home' CHECK (home_away IN ('home', 'away')),
  result       TEXT,                 -- e.g. "3-0" — filled in after the match
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_date_idx ON public.matches(match_date DESC);

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.matches;
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.matches FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ─── 2. Proposals scoped to a specific match (optional) ────────────────────
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_match_idx ON public.proposals(match_id);

-- ─── 3. Expected/actual media reach per match — manually editable ──────────
-- Breakdown mirrors what commercial decks report: official club channels,
-- unofficial/fan accounts, rival club accounts, and media/TV/radio coverage.
CREATE TABLE IF NOT EXISTS public.match_media_reach (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id               UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  official_views         BIGINT NOT NULL DEFAULT 0,  -- club's own official posts (all platforms)
  unofficial_fan_views   BIGINT NOT NULL DEFAULT 0,  -- fan accounts / unofficial supporter pages
  rival_account_views    BIGINT NOT NULL DEFAULT 0,  -- rival club / rival fan accounts
  media_tv_radio_views   BIGINT NOT NULL DEFAULT 0,  -- national/regional press, TV, radio
  source_notes           TEXT,                       -- free text: where these numbers came from
  updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_match_media_reach_updated_at ON public.match_media_reach;
CREATE TRIGGER trg_match_media_reach_updated_at
  BEFORE UPDATE ON public.match_media_reach
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.match_media_reach ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='match_media_reach' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.match_media_reach FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ─── 4. CRM warm-up strategies (reusable, multi-step) ───────────────────────
-- Same shape as email_sequences (0038) but steps are relationship-building
-- touchpoints, not emails: invite to match, dinner, send proposal, etc.
CREATE TABLE IF NOT EXISTS public.warmup_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
    -- [{ "step": 1, "type": "invite_to_match", "label": "Invite CMO to a match", "delay_days": 0 },
    --  { "step": 2, "type": "dinner",          "label": "Post-match dinner",     "delay_days": 3 },
    --  { "step": 3, "type": "send_proposal",   "label": "Send proposal",         "delay_days": 7 }]
    -- "type" is free-form but the UI offers: invite_to_match | dinner | call | meeting | send_proposal | custom
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_warmup_sequences_updated_at ON public.warmup_sequences;
CREATE TRIGGER trg_warmup_sequences_updated_at
  BEFORE UPDATE ON public.warmup_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.warmup_sequences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='warmup_sequences' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.warmup_sequences FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ─── 5. Per-company enrollment in a warm-up strategy ────────────────────────
CREATE TABLE IF NOT EXISTS public.warmup_enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   UUID NOT NULL REFERENCES public.warmup_sequences(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_name  TEXT,               -- e.g. the CMO being warmed up
  match_id      UUID REFERENCES public.matches(id) ON DELETE SET NULL,  -- which match they're invited to, if relevant
  current_step  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active', -- active | paused | completed | cancelled
  next_action_at TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmup_enroll_company_idx ON public.warmup_enrollments(company_id);
CREATE INDEX IF NOT EXISTS warmup_enroll_due_idx ON public.warmup_enrollments(status, next_action_at);

DROP TRIGGER IF EXISTS trg_warmup_enrollments_updated_at ON public.warmup_enrollments;
CREATE TRIGGER trg_warmup_enrollments_updated_at
  BEFORE UPDATE ON public.warmup_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.warmup_enrollments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='warmup_enrollments' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.warmup_enrollments FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ─── 6. Seed a starter warm-up sequence matching James's example ───────────
INSERT INTO public.warmup_sequences (name, description, steps, is_default)
VALUES (
  'Padrão — Convite para Jogo → Jantar → Proposta',
  'Fluxo de aquecimento: convidar o CMO/decisor para um jogo, jantar pós-jogo e então enviar a proposta.',
  '[{"step":1,"type":"invite_to_match","label":"Convidar para um jogo","delay_days":0},
    {"step":2,"type":"dinner","label":"Jantar pós-jogo","delay_days":3},
    {"step":3,"type":"send_proposal","label":"Enviar proposta","delay_days":7}]',
  TRUE
) ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

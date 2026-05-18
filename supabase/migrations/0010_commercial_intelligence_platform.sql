-- Migration 0010: Commercial Intelligence Platform — New Modules
-- Creates tables for:
--   - coritiba_metrics (city/club/fanbase metrics)
--   - inventory_items (physical + digital sponsorship inventory)
--   - barter_items (goods needed + barter opportunities)
--   - social_projects (Lei de Incentivo projects)
--   - pipeline_leads (CRM pipeline readiness)
--   - visual_mockups (AI media generation foundation)

-- ─────────────────────────────────────────────────────────────────────────────
-- coritiba_metrics: reusable city/club/fanbase data for proposals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coritiba_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,         -- 'city' | 'club' | 'fanbase' | 'social' | 'stadium' | 'broadcast' | 'sponsorship'
  metric_name   TEXT NOT NULL,
  metric_value  TEXT NOT NULL,
  unit          TEXT,                  -- e.g. 'pessoas', 'seguidores', 'R$', '%'
  description   TEXT,
  source        TEXT,                  -- e.g. 'IBGE 2024', 'Coritiba FC oficial'
  is_featured   BOOLEAN DEFAULT FALSE, -- show in proposals
  sort_order    INT DEFAULT 0,
  status        TEXT DEFAULT 'active', -- 'active' | 'archived'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with real Coritiba FC / Curitiba data
INSERT INTO public.coritiba_metrics (category, metric_name, metric_value, unit, description, source, is_featured, sort_order) VALUES
('city',       'Population of Curitiba',           '1.95 milhões',   'pessoas',      'Capital do Paraná — 8ª maior cidade do Brasil',                 'IBGE 2024',              TRUE,  1),
('city',       'Paraná state GDP',                  'R$ 600 bilhões', 'R$/ano',       'Um dos maiores PIBs do Brasil',                                 'IBGE 2023',              TRUE,  2),
('city',       'Greater Curitiba area population',  '3.7 milhões',    'pessoas',      'Região Metropolitana de Curitiba',                              'IBGE 2024',              FALSE, 3),
('city',       'Curitiba per-capita income',         'R$ 3.800',       'R$/mês',       'Acima da média nacional',                                       'IBGE 2023',              FALSE, 4),
('city',       'Internet penetration Paraná',        '87%',            '%',            'Alta penetração digital favorece campanhas online',             'TIC Domicílios 2023',    FALSE, 5),
('club',       'Club founded',                       '1909',           '',             'Um dos clubes mais antigos do Brasil',                           'Coritiba FC oficial',    TRUE,  1),
('club',       'Stadium — Couto Pereira capacity',   '40.502',         'lugares',      'Estádio Major Antônio Couto Pereira, Curitiba, PR',             'Coritiba FC oficial',    TRUE,  2),
('club',       'Average matchday attendance',        '18.000–28.000',  'torcedores',   'Média de público por jogo no Couto Pereira',                   'Coritiba FC 2024',       TRUE,  3),
('club',       'National championship titles',       '2',              'títulos',      'Campeão Brasileiro 1985 e 1990',                                'CBF',                    FALSE, 4),
('club',       'Home matches per season',            '38+',            'jogos/ano',    'Brasileirão + Copa do Brasil + Campeonato Paranaense',          'CBF 2024',               TRUE,  5),
('fanbase',    'Social media total followers',       '1.5M+',          'seguidores',   'Instagram + YouTube + TikTok + X (Twitter) combinados',        'Coritiba FC 2024',       TRUE,  1),
('fanbase',    'Instagram followers',                '850K+',          'seguidores',   '@Coritiba — conta oficial',                                     'Instagram 2024',         FALSE, 2),
('fanbase',    'YouTube subscribers',                '300K+',          'inscritos',    'Canal oficial Coritiba FC',                                     'YouTube 2024',           FALSE, 3),
('fanbase',    'TikTok followers',                   '200K+',          'seguidores',   'Conta oficial TikTok Coritiba',                                 'TikTok 2024',            FALSE, 4),
('fanbase',    'Average fan age',                    '18–45 anos',     '',             'Público principal multi-geracional',                            'Pesquisa Coritiba 2023', TRUE,  5),
('fanbase',    'Female fan percentage',              '35%',            '% da torcida', 'Crescimento no público feminino',                               'Pesquisa Coritiba 2023', FALSE, 6),
('broadcast',  'National TV broadcast',              'Globo / SporTV', '',             'Transmissão nacional — cobertura de 150M+ domicílios',          'Globo 2024',             TRUE,  1),
('broadcast',  'Streaming platforms',                'Paramount+ / Cazé TV', '',       'Transmissão por streaming para todo o Brasil',                  '2024',                   FALSE, 2),
('broadcast',  'Regional TV — Paraná',               'RPC / Band Paraná', '',          'Cobertura regional prioritária — mercado local',                '2024',                   FALSE, 3),
('sponsorship','LED board perimeter exposure',       '90+ minutos',    'por jogo',     'Visibilidade nas placas de LED durante todo o jogo',            'Coritiba FC 2024',       TRUE,  1),
('sponsorship','Jersey brand impressions / match',   '50.000+',        'impressões',   'Estimativa de visibilidade no estádio + câmeras',               'Estimativa Coritiba',    TRUE,  2),
('sponsorship','Digital campaign reach / post',      '80.000–500.000', 'alcance',      'Post orgânico nas redes sociais oficiais',                      'Coritiba FC 2024',       TRUE,  3),
('sponsorship','Press backdrop TV impressions',      '200.000+',       'impressões',   'Backdrop em entrevistas pós-jogo — exibido ao vivo',           'Estimativa Coritiba',    FALSE, 4)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- inventory_items: physical + digital sponsorship inventory
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  inventory_type  TEXT NOT NULL DEFAULT 'physical',  -- 'physical' | 'digital'
  category        TEXT NOT NULL,                      -- see categories below
  -- Physical: 'led_board' | 'jersey' | 'banner' | 'scoreboard' | 'press_backdrop' | 'stadium_branding' | 'training_kit' | 'vip_area'
  -- Digital:  'social_post' | 'stories' | 'video_content' | 'reels' | 'youtube' | 'sponsored_content' | 'influencer' | 'email_newsletter' | 'app_push'
  price_min       NUMERIC(12,2),
  price_max       NUMERIC(12,2),
  currency        TEXT DEFAULT 'BRL',
  unit            TEXT,                               -- e.g. 'per match', 'per month', 'per season'
  availability    TEXT DEFAULT 'available',           -- 'available' | 'limited' | 'sold'
  exposure_reach  TEXT,
  exposure_notes  TEXT,
  placement_zone  TEXT,                               -- e.g. 'jersey_chest', 'led_perimeter'
  dimensions      TEXT,
  ai_prompt_ref   UUID REFERENCES public.brand_assets(id) ON DELETE SET NULL,
  sort_order      INT DEFAULT 0,
  status          TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with Coritiba FC inventory
INSERT INTO public.inventory_items (name, description, inventory_type, category, price_min, price_max, unit, availability, exposure_reach, placement_zone, sort_order) VALUES
('Jersey Front — Principal Sponsor',  'Logo principal no peito da camisa oficial Coritiba FC (home + away)',           'physical', 'jersey',           80000, 250000, 'per month',  'limited',   '40K+ torcedores/jogo + TV nacional',          'jersey_chest',       1),
('Jersey Sleeve — Patrocinador',      'Logo na manga da camisa oficial Coritiba FC',                                   'physical', 'jersey',           25000, 80000,  'per month',  'available', '40K+ torcedores/jogo + TV nacional',          'jersey_sleeve',      2),
('Jersey Back / Name Sponsor',        'Logo abaixo do número nas costas da camisa',                                    'physical', 'jersey',           15000, 50000,  'per month',  'available', '40K+ torcedores/jogo',                        'jersey_back',        3),
('Couto Pereira LED Perimeter',       'Placas de LED perímetro do campo — exibição durante jogos',                     'physical', 'led_board',        20000, 60000,  'per match',  'available', 'Visível em todas as câmeras de transmissão',  'led_perimeter',      4),
('Giant Scoreboard — Couto Pereira',  'Anúncio no placar eletrônico gigante durante os jogos',                         'physical', 'scoreboard',        8000, 25000,  'per match',  'available', 'Visível por todos os 40K+ presentes',        'scoreboard',         5),
('Press Backdrop / Flash Zone',       'Logo no backdrop de entrevistas e coletivas pós-jogo',                          'physical', 'press_backdrop',    5000, 20000,  'per month',  'available', 'Transmissão ao vivo + redes sociais',         'press_backdrop',     6),
('Stadium Naming Rights',             'Naming rights do Estádio Couto Pereira',                                        'physical', 'stadium_branding', 200000, 800000,'per month',  'limited',   'Cobertura nacional — maior exposição',        'stadium_name',       7),
('Training Kit Sponsor',              'Logo no uniforme de treino e aquecimento oficial',                               'physical', 'training_kit',      5000, 20000,  'per month',  'available', 'Coberturas de treino + redes sociais',        'training_kit',       8),
('VIP Hospitality Package',           'Camarote VIP + branding no espaço VIP do Couto Pereira',                       'physical', 'vip_area',          3000, 15000,  'per match',  'available', 'Executivos + redes sociais do clube',         'vip_area',           9),
('Instagram Feed Post — Patrocinado', 'Post patrocinado no feed oficial @Coritiba (850K+ seguidores)',                'digital',  'social_post',        2000, 8000,   'per post',   'available', '80K–500K alcance orgânico',                   NULL,                 1),
('Instagram Stories — Activation',   'Stories patrocinados com link e CTA no perfil oficial',                         'digital',  'stories',            1500, 5000,   'per story',  'available', '150K–400K visualizações médias',              NULL,                 2),
('YouTube — Sponsored Video',         'Vídeo patrocinado ou integração no canal oficial YouTube (300K inscritos)',     'digital',  'youtube',            5000, 25000,  'per video',  'available', '50K–300K visualizações/vídeo',                NULL,                 3),
('TikTok Reels — Viral Activation',   'Reels / TikTok patrocinados com menção de marca',                               'digital',  'reels',              2000, 10000,  'per reel',   'available', '50K–500K visualizações médias',               NULL,                 4),
('Player Content — Brand Integration','Jogadores mencionando a marca em seus próprios canais',                         'digital',  'influencer',         5000, 30000,  'per campaign','available','Audiência combinada dos jogadores',            NULL,                 5),
('Email Newsletter — Patrocinado',    'Patrocínio no boletim oficial enviado a sócios e torcedores',                   'digital',  'email_newsletter',   1500, 5000,   'per send',   'available', '50K+ contatos na base',                       NULL,                 6)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- barter_items: goods/services needed for sponsorship barter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.barter_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name           TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL,     -- 'product' | 'service' | 'technology' | 'media' | 'logistics' | 'food_beverage' | 'equipment'
  quantity            TEXT,
  current_supplier    TEXT,
  current_price       NUMERIC(12,2),
  target_price        NUMERIC(12,2),
  currency            TEXT DEFAULT 'BRL',
  barter_type         TEXT DEFAULT 'full_barter',  -- 'full_barter' | 'partial_barter' | 'negotiated_discount'
  status              TEXT DEFAULT 'open',          -- 'open' | 'in_negotiation' | 'closed' | 'cancelled'
  priority            TEXT DEFAULT 'medium',        -- 'high' | 'medium' | 'low'
  notes               TEXT,
  ai_analysis         JSONB DEFAULT NULL,            -- AI supplier/competitor analysis
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- social_projects: Lei de Incentivo / social impact programs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  project_type    TEXT NOT NULL,     -- 'esporte' | 'educacao' | 'cultura' | 'saude' | 'meio_ambiente' | 'comunidade'
  lei_type        TEXT,              -- 'Lei Rouanet' | 'Lei de Incentivo ao Esporte' | 'Lei Municipal' | 'Sem Lei'
  budget_total    NUMERIC(12,2),
  budget_raised   NUMERIC(12,2) DEFAULT 0,
  currency        TEXT DEFAULT 'BRL',
  start_date      DATE,
  end_date        DATE,
  deadline_apply  DATE,
  location        TEXT DEFAULT 'Curitiba, PR',
  beneficiaries   TEXT,
  social_impact   TEXT,
  tax_benefit     TEXT,             -- tax deduction info for donors
  status          TEXT DEFAULT 'open',  -- 'open' | 'active' | 'completed' | 'cancelled'
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,  -- linked sponsor if applicable
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with example social projects
INSERT INTO public.social_projects (name, description, project_type, lei_type, budget_total, location, beneficiaries, social_impact, tax_benefit, status) VALUES
('Coxa Academy Digital',
 'Programa de letramento digital para jovens atletas da base do Coritiba FC, integrando futebol e tecnologia.',
 'esporte', 'Lei de Incentivo ao Esporte', 150000,
 'Curitiba, PR', '200 jovens atletas (12–18 anos)',
 'Redução da evasão escolar, inclusão digital, desenvolvimento integral do atleta',
 'Empresa pode deduzir até 1% do IR devido (pessoa jurídica)',
 'open'),
('Verde & Conectado — Sustentabilidade no Couto Pereira',
 'Projeto de gestão de resíduos e energia renovável no Estádio Couto Pereira, com educação ambiental.',
 'meio_ambiente', 'Lei Municipal de Curitiba', 200000,
 'Curitiba, PR', 'Comunidade do entorno do Couto Pereira + 40K torcedores/jogo',
 'Redução de 30% do consumo de energia + educação ambiental para a comunidade',
 'Benefício fiscal municipal + visibilidade ESG para empresa patrocinadora',
 'open'),
('Futebol para Todos — Inclusão Social',
 'Escola de futebol gratuita para crianças em situação de vulnerabilidade nos arredores do Couto Pereira.',
 'esporte', 'Lei de Incentivo ao Esporte', 80000,
 'Curitiba, PR — Bairros: Água Verde e Prado Velho', '150 crianças (7–14 anos)',
 'Desenvolvimento social, redução da violência, inclusão de crianças carentes',
 'Dedução de IR + forte apelo de responsabilidade social',
 'open')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_leads: CRM pipeline readiness (Pipedrive-ready structure)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  proposal_id     UUID REFERENCES public.proposals(id) ON DELETE SET NULL,

  -- CRM-standard fields (Pipedrive-compatible)
  title           TEXT NOT NULL,
  stage           TEXT NOT NULL DEFAULT 'prospect',
  -- Stage pipeline: prospect → qualified → contacted → proposal_sent → negotiation → closed_won → closed_lost
  owner           TEXT,               -- team member responsible
  value           NUMERIC(12,2),      -- deal value estimate
  currency        TEXT DEFAULT 'BRL',
  probability     INT DEFAULT 0,       -- 0–100%
  expected_close  DATE,
  source          TEXT DEFAULT 'outbound',  -- 'outbound' | 'inbound' | 'referral' | 'event'

  -- Outreach tracking
  last_contact_at TIMESTAMPTZ,
  last_contact_by TEXT,
  next_followup   DATE,
  contact_count   INT DEFAULT 0,

  -- Pipedrive integration stub (for future)
  pipedrive_deal_id   TEXT,
  pipedrive_org_id    TEXT,
  pipedrive_synced_at TIMESTAMPTZ,

  notes           TEXT,
  status          TEXT DEFAULT 'active',   -- 'active' | 'archived'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_leads_company_id ON public.pipeline_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_stage ON public.pipeline_leads(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_status ON public.pipeline_leads(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- visual_mockups: AI media generation foundation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visual_mockups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  inventory_id    UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  mockup_type     TEXT NOT NULL,     -- 'jersey' | 'led_board' | 'stadium_banner' | 'social_post' | 'press_backdrop' | 'scoreboard'
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'generating' | 'generated' | 'approved' | 'rejected'

  -- AI generation
  ai_prompt       TEXT,
  negative_prompt TEXT,
  style_preset    TEXT,
  ai_provider     TEXT,              -- 'dalle3' | 'stability' | 'midjourney' | 'manual'
  generation_params JSONB DEFAULT '{}',

  -- Placement specs
  placement_zone  TEXT,
  sponsor_logo_url TEXT,             -- URL of uploaded sponsor logo
  placement_coords JSONB DEFAULT '{}', -- {x, y, width, height, rotation} for logo overlay
  template_ref    UUID REFERENCES public.brand_assets(id) ON DELETE SET NULL,

  -- Output
  output_url      TEXT,              -- generated/uploaded image URL
  thumbnail_url   TEXT,
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_mockups_proposal_id ON public.visual_mockups(proposal_id);
CREATE INDEX IF NOT EXISTS idx_visual_mockups_company_id ON public.visual_mockups(company_id);
CREATE INDEX IF NOT EXISTS idx_visual_mockups_status ON public.visual_mockups(status);
CREATE INDEX IF NOT EXISTS idx_visual_mockups_mockup_type ON public.visual_mockups(mockup_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS for all new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.coritiba_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barter_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_mockups    ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DO $$ 
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coritiba_metrics','inventory_items','barter_items','social_projects','pipeline_leads','visual_mockups']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_read_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_read_%s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_write_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_write_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_upd_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_upd_%s" ON public.%I FOR UPDATE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- Updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coritiba_metrics','inventory_items','barter_items','social_projects','pipeline_leads','visual_mockups']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

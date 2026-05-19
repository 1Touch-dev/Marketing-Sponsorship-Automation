import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    migrations: {
      "0009": "Company intelligence columns",
      "0010": "New modules: coritiba_metrics, inventory_items, barter_items, social_projects, pipeline_leads, visual_mockups",
      "0011": "Guided OS: proposal_wizard_drafts, proposal_sections, image_generation_jobs, company_logos, crm_sync_queue",
    },
    usage: "POST with { migration: '0009' | '0010' | '0011' }",
  });
}

export async function POST(req: Request) {
  const { migration } = await req.json().catch(() => ({ migration: null }));
  if (!migration) return NextResponse.json({ error: "Provide migration number" }, { status: 400 });

  const sqlMap: Record<string, string> = {
    "0009": SQL_0009,
    "0010": SQL_0010,
    "0011": SQL_0011,
  };

  const sql = sqlMap[migration];
  if (!sql) return NextResponse.json({ error: `Unknown migration: ${migration}` }, { status: 400 });

  try {
    
    const { Client } = require("pg");
    const pass = process.env.SUPABASE_DB_PASSWORD ?? "";
    const url = process.env.SUPABASE_URL ?? "";
    const ref = url.replace("https://", "").replace(".supabase.co", "");

    if (!pass || !ref) throw new Error("No DB credentials");

    const encoded = encodeURIComponent(pass);
    const dbUrl = `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await client.connect();
    await client.query(sql);
    await client.end();
    return NextResponse.json({ success: true, method: "pg", migration });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      success: false,
      method: "pg_failed",
      error: msg,
      migration,
      instructions: "Apply the SQL manually in Supabase Dashboard > SQL Editor",
      sql,
    }, { status: 422 });
  }
}

export async function PUT(req: Request) {
  const { table } = await req.json().catch(() => ({ table: null }));
  const sb = supabaseAdmin();
  if (table === "coritiba_metrics") {
    const { error } = await sb.from("coritiba_metrics" as "companies").insert(CORITIBA_SEED as unknown[]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, seeded: CORITIBA_SEED.length });
  }
  if (table === "inventory_items") {
    const { error } = await sb.from("inventory_items" as "companies").insert(INVENTORY_SEED as unknown[]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, seeded: INVENTORY_SEED.length });
  }
  if (table === "social_projects") {
    const { error } = await sb.from("social_projects" as "companies").insert(SOCIAL_SEED as unknown[]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, seeded: SOCIAL_SEED.length });
  }
  return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
}

// ── SQL Migrations ──────────────────────────────────────────────────────────

const SQL_0009 = `
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'local';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_size TEXT DEFAULT 'medium';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'B2C';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sponsorship_history TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS full_intelligence JSONB DEFAULT NULL;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS intelligence_updated_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'prospect';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_companies_segment ON public.companies(segment);
CREATE INDEX IF NOT EXISTS idx_companies_company_size ON public.companies(company_size);
CREATE INDEX IF NOT EXISTS idx_companies_business_type ON public.companies(business_type);
CREATE INDEX IF NOT EXISTS idx_companies_pipeline_stage ON public.companies(pipeline_stage);
`;

const SQL_0010 = `
CREATE TABLE IF NOT EXISTS public.coritiba_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value TEXT NOT NULL,
  unit TEXT,
  description TEXT,
  source TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  inventory_type TEXT NOT NULL DEFAULT 'physical',
  category TEXT NOT NULL,
  price_min NUMERIC(12,2),
  price_max NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  unit TEXT,
  availability TEXT DEFAULT 'available',
  exposure_reach TEXT,
  exposure_notes TEXT,
  placement_zone TEXT,
  dimensions TEXT,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.barter_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  quantity TEXT,
  current_supplier TEXT,
  current_price NUMERIC(12,2),
  target_price NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  barter_type TEXT DEFAULT 'full_barter',
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  notes TEXT,
  ai_analysis JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.social_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL,
  lei_type TEXT,
  budget_total NUMERIC(12,2),
  budget_raised NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  start_date DATE,
  end_date DATE,
  deadline_apply DATE,
  location TEXT DEFAULT 'Curitiba, PR',
  beneficiaries TEXT,
  social_impact TEXT,
  tax_benefit TEXT,
  status TEXT DEFAULT 'open',
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pipeline_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'prospect',
  owner TEXT,
  value NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  probability INT DEFAULT 0,
  expected_close DATE,
  source TEXT DEFAULT 'outbound',
  last_contact_at TIMESTAMPTZ,
  next_followup DATE,
  pipedrive_deal_id TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.visual_mockups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mockup_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  ai_prompt TEXT,
  negative_prompt TEXT,
  ai_provider TEXT,
  generation_params JSONB DEFAULT '{}',
  placement_zone TEXT,
  sponsor_logo_url TEXT,
  placement_coords JSONB DEFAULT '{}',
  output_url TEXT,
  thumbnail_url TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coritiba_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barter_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_mockups ENABLE ROW LEVEL SECURITY;
DO $$ 
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coritiba_metrics','inventory_items','barter_items','social_projects','pipeline_leads','visual_mockups']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
`;

const SQL_0011 = `
CREATE TABLE IF NOT EXISTS public.proposal_wizard_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key      TEXT UNIQUE NOT NULL,
  current_step     INT DEFAULT 1,
  proposal_type    TEXT DEFAULT 'sponsorship',
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  campaign_id      UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  selected_components JSONB DEFAULT '[]',
  selected_strategies JSONB DEFAULT '[]',
  custom_brief     TEXT,
  generation_options JSONB DEFAULT '{}',
  generated_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  status           TEXT DEFAULT 'in_progress',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wizard_drafts_session ON public.proposal_wizard_drafts(session_key);

CREATE TABLE IF NOT EXISTS public.proposal_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_type     TEXT NOT NULL,
  title            TEXT,
  content          TEXT,
  content_json     JSONB,
  sort_order       INT DEFAULT 0,
  is_visible       BOOLEAN DEFAULT TRUE,
  is_locked        BOOLEAN DEFAULT FALSE,
  generation_prompt TEXT,
  ai_model         TEXT,
  version          INT DEFAULT 1,
  last_regenerated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal ON public.proposal_sections(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_order ON public.proposal_sections(proposal_id, sort_order);

CREATE TABLE IF NOT EXISTS public.image_generation_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  mockup_id        UUID REFERENCES public.visual_mockups(id) ON DELETE SET NULL,
  job_type         TEXT NOT NULL,
  status           TEXT DEFAULT 'pending_approval',
  prompt           TEXT NOT NULL,
  negative_prompt  TEXT,
  style_notes      TEXT,
  provider         TEXT DEFAULT 'dall-e-3',
  model            TEXT DEFAULT 'dall-e-3',
  size             TEXT DEFAULT '1024x1024',
  quality          TEXT DEFAULT 'standard',
  n_images         INT DEFAULT 1,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  output_urls      JSONB DEFAULT '[]',
  selected_url     TEXT,
  error_message    TEXT,
  generation_ms    INT,
  triggered_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_img_jobs_proposal ON public.image_generation_jobs(proposal_id);
CREATE INDEX IF NOT EXISTS idx_img_jobs_status ON public.image_generation_jobs(status);

CREATE TABLE IF NOT EXISTS public.company_logos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  original_url     TEXT,
  stored_url       TEXT,
  format           TEXT,
  width            INT,
  height           INT,
  has_transparency BOOLEAN DEFAULT FALSE,
  is_primary       BOOLEAN DEFAULT FALSE,
  fetch_status     TEXT DEFAULT 'pending',
  fetch_error      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_logos_company ON public.company_logos(company_id);

CREATE TABLE IF NOT EXISTS public.crm_sync_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  operation        TEXT NOT NULL,
  crm_provider     TEXT DEFAULT 'pipedrive',
  crm_entity_id    TEXT,
  crm_entity_type  TEXT,
  payload          JSONB DEFAULT '{}',
  status           TEXT DEFAULT 'pending',
  attempts         INT DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_sync_status ON public.crm_sync_queue(status);

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_source TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_fetched_at TIMESTAMPTZ;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS wizard_draft_id UUID REFERENCES public.proposal_wizard_drafts(id) ON DELETE SET NULL;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS proposal_type TEXT DEFAULT 'sponsorship';
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS selected_components JSONB DEFAULT '[]';
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS selected_strategies JSONB DEFAULT '[]';

ALTER TABLE public.proposal_wizard_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_generation_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_logos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_queue         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposal_wizard_drafts','proposal_sections','image_generation_jobs','company_logos','crm_sync_queue']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
`;

// ── Seed data ────────────────────────────────────────────────────────────────

const CORITIBA_SEED = [
  { category: "city", metric_name: "Population of Curitiba", metric_value: "1.95 milhões", unit: "pessoas", description: "Capital do Paraná — 8ª maior cidade do Brasil", source: "IBGE 2024", is_featured: true, sort_order: 1 },
  { category: "city", metric_name: "Paraná state GDP", metric_value: "R$ 600 bilhões", unit: "R$/ano", description: "Um dos maiores PIBs do Brasil", source: "IBGE 2023", is_featured: true, sort_order: 2 },
  { category: "club", metric_name: "Stadium — Couto Pereira capacity", metric_value: "40.502", unit: "lugares", description: "Estádio Major Antônio Couto Pereira, Curitiba, PR", source: "Coritiba FC oficial", is_featured: true, sort_order: 1 },
  { category: "club", metric_name: "Average matchday attendance", metric_value: "18.000–28.000", unit: "torcedores", description: "Média de público por jogo no Couto Pereira", source: "Coritiba FC 2024", is_featured: true, sort_order: 2 },
  { category: "fanbase", metric_name: "Social media total followers", metric_value: "1.5M+", unit: "seguidores", description: "Instagram + YouTube + TikTok + X combinados", source: "Coritiba FC 2024", is_featured: true, sort_order: 1 },
  { category: "broadcast", metric_name: "National TV broadcast", metric_value: "Globo / SporTV", unit: "", description: "Transmissão nacional — cobertura de 150M+ domicílios", source: "Globo 2024", is_featured: true, sort_order: 1 },
  { category: "sponsorship", metric_name: "LED board perimeter exposure", metric_value: "90+ minutos", unit: "por jogo", description: "Visibilidade nas placas de LED durante todo o jogo", source: "Coritiba FC 2024", is_featured: true, sort_order: 1 },
];

const INVENTORY_SEED = [
  { name: "Jersey Front — Principal Sponsor", description: "Logo principal no peito da camisa oficial Coritiba FC", inventory_type: "physical", category: "jersey", price_min: 80000, price_max: 250000, unit: "per month", availability: "limited", exposure_reach: "40K+ torcedores/jogo + TV nacional", placement_zone: "jersey_chest", sort_order: 1 },
  { name: "Jersey Sleeve — Patrocinador", description: "Logo na manga da camisa oficial Coritiba FC", inventory_type: "physical", category: "jersey", price_min: 25000, price_max: 80000, unit: "per month", availability: "available", placement_zone: "jersey_sleeve", sort_order: 2 },
  { name: "Couto Pereira LED Perimeter", description: "Placas de LED perímetro do campo", inventory_type: "physical", category: "led_board", price_min: 20000, price_max: 60000, unit: "per match", availability: "available", placement_zone: "led_perimeter", sort_order: 3 },
  { name: "Giant Scoreboard — Couto Pereira", description: "Anúncio no placar eletrônico gigante", inventory_type: "physical", category: "scoreboard", price_min: 8000, price_max: 25000, unit: "per match", availability: "available", sort_order: 4 },
  { name: "Press Backdrop / Flash Zone", description: "Logo no backdrop de entrevistas pós-jogo", inventory_type: "physical", category: "press_backdrop", price_min: 5000, price_max: 20000, unit: "per month", availability: "available", sort_order: 5 },
  { name: "Instagram Feed Post — Patrocinado", description: "Post patrocinado no feed oficial @Coritiba", inventory_type: "digital", category: "social_post", price_min: 2000, price_max: 8000, unit: "per post", availability: "available", sort_order: 6 },
];

const SOCIAL_SEED = [
  { name: "Coxa Academy Digital", description: "Programa de letramento digital para jovens atletas da base do Coritiba FC.", project_type: "esporte", lei_type: "Lei de Incentivo ao Esporte", budget_total: 150000, location: "Curitiba, PR", beneficiaries: "200 jovens atletas (12–18 anos)", social_impact: "Redução da evasão escolar, inclusão digital", tax_benefit: "Empresa pode deduzir até 1% do IR devido", status: "open" },
  { name: "Verde & Conectado", description: "Projeto de gestão de resíduos e energia renovável no Estádio Couto Pereira.", project_type: "meio_ambiente", lei_type: "Lei Municipal de Curitiba", budget_total: 200000, location: "Curitiba, PR", beneficiaries: "Comunidade do entorno do Couto Pereira + 40K torcedores/jogo", social_impact: "Redução de 30% do consumo de energia", tax_benefit: "Benefício fiscal municipal + visibilidade ESG", status: "open" },
];

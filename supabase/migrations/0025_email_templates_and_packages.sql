-- Migration 0025: Email templates, proposal templates, proposal packages
-- Apply in Supabase SQL Editor.

-- ─── 1. email_templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT NOT NULL DEFAULT '',
  body_html   TEXT NOT NULL DEFAULT '',
  body_text   TEXT,
  variables   JSONB NOT NULL DEFAULT '[]',   -- array of variable names e.g. ["company_name","contact_name"]
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. proposal_templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  content     JSONB NOT NULL DEFAULT '{}',
  variables   JSONB NOT NULL DEFAULT '[]',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_proposal_templates_updated_at ON public.proposal_templates;
CREATE TRIGGER trg_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. proposal_packages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_packages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,           -- e.g. "Prata", "Ouro", "Diamante"
  description    TEXT,
  price_brl      NUMERIC(12,2),
  benefits       JSONB NOT NULL DEFAULT '[]',    -- array of benefit strings
  inventory_items JSONB NOT NULL DEFAULT '[]',   -- snapshot of selected inventory lines
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proposal_packages_proposal_idx
  ON public.proposal_packages(proposal_id);

DROP TRIGGER IF EXISTS trg_proposal_packages_updated_at ON public.proposal_packages;
CREATE TRIGGER trg_proposal_packages_updated_at
  BEFORE UPDATE ON public.proposal_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Seed one default outreach email template ──────────────────────────────
INSERT INTO public.email_templates (
  name, description, subject, body_html, body_text, variables, is_default
) VALUES (
  'Outreach Padrão — Patrocínio Coritiba FC',
  'Template padrão de email de prospecção de patrocinadores.',
  'Proposta de Patrocínio — Coritiba Foot Ball Club × {{company_name}}',
  '<p>Prezado(a) {{contact_name}},</p>
<p>É com prazer que apresentamos uma proposta exclusiva de patrocínio junto ao <strong>Coritiba Foot Ball Club</strong>, um dos clubes mais tradicionais do futebol brasileiro.</p>
<p>{{proposal_summary}}</p>
<p>Confira todos os detalhes na proposta completa: <a href="{{proposal_link}}">{{proposal_link}}</a></p>
<p>Estamos à disposição para discutir os próximos passos.</p>
<p>Atenciosamente,<br/>{{sender_name}}<br/>{{sender_title}}</p>',
  'Prezado(a) {{contact_name}},

É com prazer que apresentamos uma proposta exclusiva de patrocínio junto ao Coritiba Foot Ball Club.

{{proposal_summary}}

Confira a proposta: {{proposal_link}}

Atenciosamente,
{{sender_name}}
{{sender_title}}',
  '["company_name","contact_name","proposal_summary","proposal_link","sender_name","sender_title"]',
  TRUE
) ON CONFLICT DO NOTHING;

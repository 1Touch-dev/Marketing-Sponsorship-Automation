-- Migration 0038: Email flows (sequences) + flow assignment
-- Additive + idempotent. Extends the existing draft + Pipedrive-logging email model
-- with typed flows (intro / follow_up / negotiation / barter), per-company flow
-- assignment, and a lightweight sequence step tracker.

-- ─── 1. Type a template + email + company by flow ─────────────────────────────
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'intro';
  -- intro | follow_up | negotiation | barter | generic

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS flow_type TEXT,
  ADD COLUMN IF NOT EXISTS sequence_id UUID,
  ADD COLUMN IF NOT EXISTS sequence_step INTEGER;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_email_flow TEXT;
  -- name of an email_sequences row assigned as this company's default flow

-- ─── 2. Reusable multi-step email sequences ──────────────────────────────────
-- A sequence is an ordered list of steps. Each step names a flow_type + optional
-- template + a delay (in days) after the previous step. This is the "flow" a user
-- assigns to a company/email.
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
    -- [{ "step": 1, "flow_type": "intro",       "template_id": null, "delay_days": 0 },
    --  { "step": 2, "flow_type": "follow_up",   "template_id": null, "delay_days": 4 },
    --  { "step": 3, "flow_type": "negotiation", "template_id": null, "delay_days": 7 }]
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_email_sequences_updated_at ON public.email_sequences;
CREATE TRIGGER trg_email_sequences_updated_at
  BEFORE UPDATE ON public.email_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. Per-company enrollment in a sequence ─────────────────────────────────
-- Tracks where a given company is in an assigned sequence, and when the next
-- step is due. The scheduler reads next_run_at to surface due steps.
CREATE TABLE IF NOT EXISTS public.email_sequence_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id  UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  proposal_id  UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  recipient    TEXT,
  contact_name TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active', -- active | paused | completed | cancelled
  next_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_seq_enroll_company_idx ON public.email_sequence_enrollments(company_id);
CREATE INDEX IF NOT EXISTS email_seq_enroll_due_idx ON public.email_sequence_enrollments(status, next_run_at);

DROP TRIGGER IF EXISTS trg_email_seq_enroll_updated_at ON public.email_sequence_enrollments;
CREATE TRIGGER trg_email_seq_enroll_updated_at
  BEFORE UPDATE ON public.email_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Seed the default 3-step sequence + negotiation/barter templates ───────
INSERT INTO public.email_sequences (name, description, steps, is_default)
VALUES (
  'Padrão — Introdução → Follow-up → Negociação',
  'Fluxo padrão de prospecção: apresentação, follow-up e negociação/barter.',
  '[{"step":1,"flow_type":"intro","template_id":null,"delay_days":0},
    {"step":2,"flow_type":"follow_up","template_id":null,"delay_days":4},
    {"step":3,"flow_type":"negotiation","template_id":null,"delay_days":7}]',
  TRUE
) ON CONFLICT DO NOTHING;

INSERT INTO public.email_templates (name, description, subject, body_html, body_text, variables, flow_type, is_default)
VALUES
(
  'Negociação — Ajuste de Proposta',
  'Template de negociação: flexibiliza condições e busca fechar.',
  'Coritiba FC × {{company_name}} — Ajustando a proposta para fechar',
  '<p>Prezado(a) {{contact_name}},</p>
<p>Entendemos que cada parceria precisa fazer sentido comercialmente. Podemos ajustar escopo, valores e contrapartidas do patrocínio para caber no orçamento da {{company_name}}.</p>
<p>{{proposal_summary}}</p>
<p>Que tal marcarmos 15 minutos para alinharmos as condições? Proposta atual: <a href="{{proposal_link}}">{{proposal_link}}</a></p>
<p>Atenciosamente,<br/>{{sender_name}}<br/>{{sender_title}}</p>',
  'Prezado(a) {{contact_name}}, podemos ajustar escopo, valores e contrapartidas para caber no orçamento da {{company_name}}. Proposta: {{proposal_link}}',
  '["company_name","contact_name","proposal_summary","proposal_link","sender_name","sender_title"]',
  'negotiation', FALSE
),
(
  'Barter / Permuta — Troca por Inventário',
  'Template de barter: propõe permuta usando inventário de patrocínio para descontar.',
  'Coritiba FC × {{company_name}} — Proposta de permuta (barter)',
  '<p>Prezado(a) {{contact_name}},</p>
<p>Além do modelo tradicional, o Coritiba FC pode estruturar uma <strong>permuta (barter)</strong>: parte do investimento é compensada com produtos/serviços da {{company_name}}, reduzindo o desembolso em caixa e ainda entregando exposição de marca.</p>
<p>{{proposal_summary}}</p>
<p>Veja as cotas e o inventário disponível: <a href="{{proposal_link}}">{{proposal_link}}</a></p>
<p>Atenciosamente,<br/>{{sender_name}}<br/>{{sender_title}}</p>',
  'Prezado(a) {{contact_name}}, podemos estruturar uma permuta (barter): parte do investimento compensada com produtos/serviços da {{company_name}}. Detalhes: {{proposal_link}}',
  '["company_name","contact_name","proposal_summary","proposal_link","sender_name","sender_title"]',
  'barter', FALSE
)
ON CONFLICT DO NOTHING;

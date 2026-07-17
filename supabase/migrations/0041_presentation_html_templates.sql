-- Migration 0041: Presentation templates — HTML upload + per-placeholder config
-- James: "Would it be possible to upload PowerPoint or Google Sheets or similar
-- (leaving placeholders)? And having placeholders have different prompts, and
-- different image upload and/or logo uploads to generate different needed
-- graphics — some jersey mockups, others jersey ads, etc." + "when proposals
-- are approved for an industry and logos scraped, auto customize proposals."
--
-- Phase 1 (this migration): HTML-only template upload. Each template stores the
-- raw uploaded HTML (with `[[TOKEN]]` / `[[IMG:KEY]]` placeholders) plus a
-- structured config for every detected placeholder (type, prompt, base/logo
-- overrides). A "render" is a single company's filled-in copy of a template —
-- tracked so we can show progress across a bulk run and re-open past renders.

ALTER TABLE public.proposal_templates
  ADD COLUMN IF NOT EXISTS source_type      TEXT NOT NULL DEFAULT 'sections'
    CHECK (source_type IN ('sections', 'html')),
  ADD COLUMN IF NOT EXISTS html_storage_path TEXT,     -- path in `proposal-assets` bucket
  ADD COLUMN IF NOT EXISTS html_url          TEXT,      -- public URL to the raw uploaded HTML
  ADD COLUMN IF NOT EXISTS placeholder_config JSONB NOT NULL DEFAULT '[]';
  -- placeholder_config shape (one entry per detected [[TOKEN]] / [[IMG:KEY]]):
  -- [{ "token": "COMPANY_NAME", "kind": "text" },
  --  { "token": "IMG:JERSEY_CHEST", "kind": "image", "image_type": "jersey",
  --    "placement": "chest_sponsor", "kit_type": "flat", "prompt_hint": "…",
  --    "base_image_url": null, "use_company_logo": true }]

CREATE TABLE IF NOT EXISTS public.template_renders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.proposal_templates(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  proposal_id     UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  batch_id        UUID,                    -- groups renders launched together (bulk auto-customize)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  rendered_html   TEXT,                    -- final HTML with tokens substituted
  rendered_url    TEXT,                    -- public URL of the stored final HTML
  image_results   JSONB NOT NULL DEFAULT '{}',  -- { "IMG:JERSEY_CHEST": { "url": "...", "job_id": "..." } }
  error           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_renders_template_idx ON public.template_renders(template_id);
CREATE INDEX IF NOT EXISTS template_renders_company_idx  ON public.template_renders(company_id);
CREATE INDEX IF NOT EXISTS template_renders_batch_idx    ON public.template_renders(batch_id);

DROP TRIGGER IF EXISTS trg_template_renders_updated_at ON public.template_renders;
CREATE TRIGGER trg_template_renders_updated_at
  BEFORE UPDATE ON public.template_renders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.template_renders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='template_renders' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.template_renders FOR ALL TO service_role USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

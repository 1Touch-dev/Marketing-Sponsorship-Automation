-- AI video intro: one row per "turn this generated image into a short video" request.
-- The video is made by Replicate (image to video). The job row remembers the Replicate prediction so a
-- slow render is never lost, and holds the finished file's address once it has been saved to our storage.

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  proposal_id            uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id             uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  source_image_job_id    uuid REFERENCES public.image_generation_jobs(id) ON DELETE SET NULL,
  source_image_url       text NOT NULL,
  prompt                 text NOT NULL,
  provider               text NOT NULL DEFAULT 'replicate',
  model                  text NOT NULL,
  duration_s             integer NOT NULL DEFAULT 5,
  status                 text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  provider_prediction_id text,
  output_url             text,
  error_message          text,
  cost_estimate_usd      numeric(10, 4),
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS video_jobs_proposal_idx ON public.video_jobs (tenant_id, proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_jobs_open_idx     ON public.video_jobs (status) WHERE status IN ('queued', 'processing');

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'video_jobs' AND policyname = 'service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.video_jobs FOR ALL TO service_role USING (true);
  END IF;
END $$;

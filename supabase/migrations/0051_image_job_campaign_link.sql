-- Lets an AI-generated image (image_generation_jobs) be explicitly assigned
-- to a Marketing Campaign — asked for by James 9 June 2026 ("Add select or
-- choose images. Assign to each Marketing Campaign"), never built.
ALTER TABLE public.image_generation_jobs
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS image_generation_jobs_campaign_idx ON public.image_generation_jobs(campaign_id);

NOTIFY pgrst, 'reload schema';

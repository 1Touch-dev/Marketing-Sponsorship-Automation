-- Link image_generation_jobs to proposal strategies, placements, and inventory labels
ALTER TABLE public.image_generation_jobs
  ADD COLUMN IF NOT EXISTS strategy_variant_id TEXT,
  ADD COLUMN IF NOT EXISTS strategy_label TEXT,
  ADD COLUMN IF NOT EXISTS placement_zone TEXT,
  ADD COLUMN IF NOT EXISTS inventory_label TEXT,
  ADD COLUMN IF NOT EXISTS display_label TEXT;

CREATE INDEX IF NOT EXISTS idx_img_jobs_strategy ON public.image_generation_jobs(strategy_variant_id);
CREATE INDEX IF NOT EXISTS idx_img_jobs_placement ON public.image_generation_jobs(placement_zone);

-- One persisted newsletter config per tenant (E2E-NEWS-07).
-- newsletter_segments already holds subject_template / send_day / send_hour.
-- config jsonb stores header title, intro, news items, CTA, and industry chips.

ALTER TABLE public.newsletter_segments
  ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_segments_one_default_per_tenant
  ON public.newsletter_segments (tenant_id)
  WHERE name = 'default';

NOTIFY pgrst, 'reload schema';

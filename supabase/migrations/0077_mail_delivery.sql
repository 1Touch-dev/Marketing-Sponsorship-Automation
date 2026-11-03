-- Real email delivery for newsletters, and a record of what the email provider (Amazon SES) reports back.
-- Before this, "Send Now" only saved a row marked "sent" and nothing was delivered.

-- 1. A newsletter can be scheduled, and now has a real life: scheduled / sending / sent / partial / failed / cancelled.
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at   timestamptz,
  ADD COLUMN IF NOT EXISTS from_address  text,
  ADD COLUMN IF NOT EXISTS reply_to      text,
  ADD COLUMN IF NOT EXISTS created_by    text;

CREATE INDEX IF NOT EXISTS newsletters_due_idx ON public.newsletters (scheduled_for) WHERE status IN ('scheduled', 'sending');

-- 2. One row per recipient: what happened to THAT address.
CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  newsletter_id       uuid NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  email               text NOT NULL CHECK (email = lower(email)),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  provider            text NOT NULL DEFAULT 'ses',
  provider_message_id text,
  skip_reason         text,
  error               text,
  attempts            integer NOT NULL DEFAULT 0,
  accepted_at         timestamptz,
  delivered_at        timestamptz,
  last_event_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (newsletter_id, email)
);
CREATE INDEX IF NOT EXISTS newsletter_deliveries_message_idx ON public.newsletter_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS newsletter_deliveries_status_idx  ON public.newsletter_deliveries (newsletter_id, status);

-- 3. Every message the provider sends us (bounces, complaints, deliveries). The provider's own id makes a repeat harmless.
CREATE TABLE IF NOT EXISTS public.mail_feedback_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  sns_message_id      text NOT NULL UNIQUE,
  event_type          text NOT NULL,
  recipient           text,
  provider_message_id text,
  bounce_type         text,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_feedback_events_message_idx ON public.mail_feedback_events (provider_message_id);

ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_feedback_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_deliveries' AND policyname = 'service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.newsletter_deliveries FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mail_feedback_events' AND policyname = 'service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.mail_feedback_events FOR ALL TO service_role USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

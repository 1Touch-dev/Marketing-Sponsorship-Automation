-- Migration: 0026_newsletters_table.sql
-- Run this in Supabase SQL Editor → New Query

CREATE TABLE IF NOT EXISTS public.newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text,
  recipient_count integer DEFAULT 0,
  recipient_emails jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'scheduled')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletters_status_idx ON public.newsletters(status);
CREATE INDEX IF NOT EXISTS newsletters_created_at_idx ON public.newsletters(created_at DESC);

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='newsletters' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.newsletters FOR ALL TO service_role USING (true);
  END IF;
END $$;

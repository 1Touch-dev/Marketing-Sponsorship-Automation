-- Run this entire block in Supabase Dashboard > SQL Editor
-- Migration: 0031 - Proposal expiry date
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Migration: 0032 - Sender profiles
CREATE TABLE IF NOT EXISTS public.sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  title TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  linkedin_url TEXT,
  html_signature TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sender_profiles' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.sender_profiles USING (true);
  END IF;
END $$;

-- Migration: 0033 - Proposal meeting link
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- Migration: 0034 - Email tracking columns (opened_at may already exist)
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

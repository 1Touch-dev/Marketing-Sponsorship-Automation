CREATE TABLE IF NOT EXISTS public.proposal_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  variant_label TEXT NOT NULL DEFAULT 'A',
  title TEXT,
  hero_text TEXT,
  cta_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.proposal_variants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposal_variants' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.proposal_variants USING (true);
  END IF;
END $$;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS ab_variant TEXT DEFAULT 'A';

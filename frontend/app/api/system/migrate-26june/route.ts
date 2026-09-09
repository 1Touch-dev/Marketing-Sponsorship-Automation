import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";

const MIGRATIONS = [
  `ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS public.sender_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    title TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    linkedin_url TEXT,
    html_signature TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sender_profiles' AND policyname='service_role_all') THEN
      CREATE POLICY "service_role_all" ON public.sender_profiles USING (true);
    END IF;
  END $$`,
  `ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS meeting_link TEXT`,
  `ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ`,
  `ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ`,
];

export async function POST(req: Request) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;

  const sb = supabaseAdmin();
  const results: { sql: string; ok: boolean; error?: string }[] = [];

  for (const sql of MIGRATIONS) {
    try {
      const { error } = await (sb as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> }).rpc("exec_sql", { query: sql });
      if (error) {
        results.push({ sql: sql.slice(0, 60), ok: false, error: String(error) });
      } else {
        results.push({ sql: sql.slice(0, 60), ok: true });
      }
    } catch (e) {
      results.push({ sql: sql.slice(0, 60), ok: false, error: String(e) });
    }
  }

  return NextResponse.json({ results });
}

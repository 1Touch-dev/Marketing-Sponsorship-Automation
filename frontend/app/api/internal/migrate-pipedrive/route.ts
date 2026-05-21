import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const sb = supabaseAdmin();

  // Check column existence
  const { error } = await (sb as any)
    .from("companies")
    .select("pipedrive_org_id")
    .limit(1);

  if (!error) {
    return NextResponse.json({
      status: "columns_already_exist",
      message: "Pipedrive columns are already in the database",
    });
  }

  const sql = `-- Run this in Supabase Dashboard > SQL Editor
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pipedrive_org_id    INTEGER,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at TIMESTAMPTZ;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id     INTEGER,
  ADD COLUMN IF NOT EXISTS pipedrive_pipeline_id INTEGER,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at   TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';`;

  return NextResponse.json({
    status: "columns_missing",
    message: "Run the SQL below in Supabase Dashboard → SQL Editor",
    sql,
    dashboard_url: "https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new",
  });
}

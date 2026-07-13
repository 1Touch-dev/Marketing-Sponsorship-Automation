import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal_id");
  if (!proposalId) return NextResponse.json({ jobs: [] });

  const sb = supabaseAdmin();
  const { data, error } = await (sb as any)
    .from("image_generation_jobs")
    .select("placement_zone, selected_url, display_label, generation_ms")
    .eq("proposal_id", proposalId)
    .eq("job_type", "stadium_mockup_official")
    .not("selected_url", "is", null)
    .order("created_at", { ascending: false });

  if (error || !data) return NextResponse.json({ jobs: [] });

  // Deduplicate: keep only most recent per placement_zone
  const seen = new Set<string>();
  const jobs = (data as Array<{ placement_zone: string; selected_url: string; display_label: string; generation_ms: number }>)
    .filter((j) => {
      if (seen.has(j.placement_zone)) return false;
      seen.add(j.placement_zone);
      return true;
    });

  return NextResponse.json({ jobs });
}

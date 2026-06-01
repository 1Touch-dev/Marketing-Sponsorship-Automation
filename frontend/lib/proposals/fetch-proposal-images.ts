import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildProposalImagesFromJobs,
  type ImageJobRow,
  type ProposalImageAsset,
} from "./proposal-images";

export async function fetchProposalImagesForLanding(
  proposalId: string
): Promise<ProposalImageAsset[]> {
  const sb = supabaseAdmin();
  const { data: imageJobs } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("image_generation_jobs")
    .select("*")
    .eq("proposal_id", proposalId)
    .in("status", ["completed", "approved"])
    .order("created_at", { ascending: false });

  return buildProposalImagesFromJobs((imageJobs ?? []) as ImageJobRow[]);
}

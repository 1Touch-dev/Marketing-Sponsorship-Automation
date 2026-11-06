import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { userActor } from "@/lib/identity/actor";
import { syncVideoJob, VideoJobError } from "@/lib/video/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/media/video/:id — checks the render with Replicate, saves the file when done, returns the job. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const job = await syncVideoJob(auth.user.tenant_id, params.id, userActor(auth.user));
    if (!job) return NextResponse.json({ error: "Video not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof VideoJobError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[video]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong with the video. Try again." }, { status: 500 });
  }
}

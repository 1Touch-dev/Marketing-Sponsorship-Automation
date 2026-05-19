import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const maxDuration = 90;

const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";

/**
 * GET /api/image-generation?proposal_id=xxx — list jobs
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal_id");
  const companyId = searchParams.get("company_id");
  const status = searchParams.get("status");

  const sb = supabaseAdmin();
  let query: any = sb.from("image_generation_jobs" as "companies").select("*").order("created_at", { ascending: false }).limit(50);

  if (proposalId) query = query.eq("proposal_id", proposalId);
  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

/**
 * POST /api/image-generation
 * Create a new image generation job (starts in pending_approval)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      proposal_id?: string;
      company_id?: string;
      mockup_id?: string;
      job_type: string;
      prompt: string;
      negative_prompt?: string;
      style_notes?: string;
      provider?: string;
      size?: string;
      quality?: string;
      n_images?: number;
      triggered_by?: string;
    };

    if (!body.prompt || body.prompt.length < 10) {
      return NextResponse.json({ error: "Prompt required (min 10 chars)" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const sb2 = sb as any;
    const { data: job, error } = await sb2
      .from("image_generation_jobs")
      .insert({
        proposal_id: body.proposal_id ?? null,
        company_id: body.company_id ?? null,
        mockup_id: body.mockup_id ?? null,
        job_type: body.job_type ?? "custom",
        status: "pending_approval",
        prompt: body.prompt,
        negative_prompt: body.negative_prompt ?? null,
        style_notes: body.style_notes ?? null,
        provider: body.provider ?? "gpt-image-1",
        model: body.provider ?? "gpt-image-1",
        size: body.size ?? "1024x1024",
        quality: body.quality ?? "standard",
        n_images: body.n_images ?? 1,
        triggered_by: body.triggered_by ?? "manual",
      } as unknown)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await recordAudit({
      action: "image_job.created",
      entity_type: "image_generation_job",
      entity_id: (job as Record<string, string>).id,
      metadata: { job_type: body.job_type, provider: body.provider ?? "gpt-image-1" },
    });

    return NextResponse.json({ job, message: "Job created — pending approval before generation" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/image-generation
 * Approve/reject a job, or trigger generation for approved jobs
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      job_id: string;
      action: "approve" | "reject" | "generate" | "select_image";
      approved_by?: string;
      rejection_reason?: string;
      selected_url?: string;
    };

    const sb = supabaseAdmin();

    // Load job
    const { data: job } = await sb
      .from("image_generation_jobs" as "companies")
      .select("*")
      .eq("id", body.job_id)
      .maybeSingle();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const j = job as Record<string, unknown>;

    if (body.action === "reject") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "rejected", rejection_reason: body.rejection_reason ?? "Rejected", approved_by: body.approved_by } as unknown as Record<string,unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true, status: "rejected" });
    }

    if (body.action === "approve") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "approved", approved_by: body.approved_by ?? "admin", approved_at: new Date().toISOString() } as unknown as Record<string,unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true, status: "approved", message: "Job approved — call generate to create images" });
    }

    if (body.action === "select_image") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ selected_url: body.selected_url } as unknown as Record<string,unknown>)
        .eq("id", body.job_id);
      // Update linked mockup if exists
      if (j.mockup_id && body.selected_url) {
        await sb.from("visual_mockups" as "companies")
          .update({ output_url: body.selected_url, status: "generated" } as unknown as Record<string,unknown>)
          .eq("id", j.mockup_id as string);
      }
      return NextResponse.json({ success: true, selected_url: body.selected_url });
    }

    if (body.action === "generate") {
      if (j.status !== "approved") {
        return NextResponse.json({ error: "Job must be approved before generating" }, { status: 400 });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

      // Mark as generating
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "generating" } as unknown as Record<string,unknown>)
        .eq("id", body.job_id);

      const startMs = Date.now();

      // Call DALL-E 3 API
      const openaiRes = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: j.model ?? "gpt-image-1",
          prompt: j.prompt as string,
          n: Math.min((j.n_images as number) ?? 1, 1),
          size: j.size ?? "1024x1024",
          quality: (j.quality === "hd" ? "high" : j.quality === "standard" ? "medium" : j.quality) ?? "medium",
        }),
      });

      const generationMs = Date.now() - startMs;

      if (!openaiRes.ok) {
        const errBody = await openaiRes.json() as { error?: { message?: string } };
        const errMsg = errBody?.error?.message ?? `OpenAI error ${openaiRes.status}`;
        await sb.from("image_generation_jobs" as "companies")
          .update({ status: "failed", error_message: errMsg, generation_ms: generationMs } as unknown as Record<string,unknown>)
          .eq("id", body.job_id);
        return NextResponse.json({ error: errMsg }, { status: 500 });
      }

      const openaiData = await openaiRes.json() as { data: Array<{ url: string; revised_prompt?: string }> };
      const outputUrls = openaiData.data.map((img, i) => ({
        url: img.url,
        revised_prompt: img.revised_prompt,
        index: i,
      }));

      await sb.from("image_generation_jobs" as "companies")
        .update({
          status: "completed",
          output_urls: outputUrls,
          selected_url: outputUrls[0]?.url ?? null,
          generation_ms: generationMs,
        } as unknown as Record<string,unknown>)
        .eq("id", body.job_id);

      // Update linked mockup
      if (j.mockup_id && outputUrls[0]?.url) {
        await sb.from("visual_mockups" as "companies")
          .update({ output_url: outputUrls[0].url, status: "generated" } as unknown as Record<string,unknown>)
          .eq("id", j.mockup_id as string);
      }

      await recordAudit({
        action: "image_job.generated",
        entity_type: "image_generation_job",
        entity_id: body.job_id,
        metadata: { images_generated: outputUrls.length, generation_ms: generationMs },
      });

      return NextResponse.json({ success: true, output_urls: outputUrls, generation_ms: generationMs });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImagePlaceholder = {
  key: string;
  label: string;
  type: "jersey" | "stadium" | "campaign" | "generic";
  prompt_hint?: string;
  required?: boolean;
};

function migrationPending(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find|not find/i.test(error.message ?? "")
  );
}

/** GET /api/proposal-templates?industry=Bebidas */
export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const industry = new URL(req.url).searchParams.get("industry");

  let query = sb
    .from("proposal_templates")
    .select("*")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("use_count", { ascending: false })
    .order("name");

  if (industry) query = query.eq("industry", industry) as typeof query;

  const { data, error } = await query;
  if (migrationPending(error)) return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/proposal-templates
 * Create a template directly, or save one from an existing proposal.
 * Body (direct): { name, industry?, description?, sections?, default_content?, image_placeholders? }
 * Body (from proposal): { name, industry?, from_proposal_id }
 */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    industry?: string;
    description?: string;
    preset_id?: string;
    sections?: string[];
    default_content?: Record<string, unknown>;
    image_placeholders?: ImagePlaceholder[];
    from_proposal_id?: string;
    is_default?: boolean;
  };

  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  let content: Record<string, unknown> = {
    sections: body.sections ?? [],
    default_content: body.default_content ?? {},
    image_placeholders: body.image_placeholders ?? [],
  };

  // Save from an existing proposal: snapshot its content as reusable defaults.
  if (body.from_proposal_id) {
    const { data: proposal } = await sb
      .from("proposals")
      .select("content, companies(industry)")
      .eq("id", body.from_proposal_id)
      .maybeSingle();
    if (!proposal) return NextResponse.json({ error: "Source proposal not found" }, { status: 404 });

    const propContent = (proposal.content ?? {}) as Record<string, unknown>;
    const sections = Object.keys(propContent).filter(
      (k) => typeof propContent[k] === "string" && (propContent[k] as string).length > 0,
    );
    content = {
      sections,
      default_content: propContent,
      image_placeholders: body.image_placeholders ?? [],
    };
    if (!body.industry) {
      const co = (proposal as { companies?: { industry?: string | null } }).companies;
      if (co?.industry) body.industry = co.industry;
    }
  }

  if (body.is_default) {
    await sb.from("proposal_templates").update({ is_default: false } as never).eq("is_default", true as never);
  }

  const insert: Record<string, unknown> = {
    name: body.name,
    description: body.description ?? null,
    content: JSON.stringify(content),
    variables: JSON.stringify([]),
    industry: body.industry ?? null,
    preset_id: body.preset_id ?? null,
    is_default: body.is_default ?? false,
  };

  let { data, error } = await sb.from("proposal_templates").insert(insert as never).select("*").single();

  // Defensive: if the industry/preset_id/use_count columns aren't migrated yet.
  if (error && /(industry|preset_id|use_count)/.test(error.message ?? "")) {
    delete insert.industry;
    delete insert.preset_id;
    ({ data, error } = await sb.from("proposal_templates").insert(insert as never).select("*").single());
  }

  if (migrationPending(error)) {
    return NextResponse.json(
      { error: "Run migration 0039_proposal_templates_industry.sql (and 0025) first", migration_pending: true },
      { status: 422 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_template",
    entity_id: (data as { id: string }).id,
    action: "proposal_template.created",
    metadata: { name: body.name, industry: body.industry ?? null, from_proposal: body.from_proposal_id ?? null },
  });

  return NextResponse.json({ data }, { status: 201 });
}

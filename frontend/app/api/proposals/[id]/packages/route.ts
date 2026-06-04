import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("proposal_packages")
    .select("*")
    .eq("proposal_id", ctx.params.id)
    .eq("active", true)
    .order("sort_order")
    .order("created_at");

  if (error?.code === "42P01" || error?.code === "PGRST205") return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(
  req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const proposalId = ctx.params.id;
  const body = await req.json().catch(() => ({})) as {
    name: string;
    description?: string;
    price_brl?: number;
    benefits?: string[];
    inventory_items?: Record<string, unknown>[];
    sort_order?: number;
  };

  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Count existing packages for sort order
  const { count } = await sb
    .from("proposal_packages")
    .select("id", { count: "exact" })
    .eq("proposal_id", proposalId)
    .eq("active", true);

  const { data, error } = await sb
    .from("proposal_packages")
    .insert({
      proposal_id: proposalId,
      name: body.name,
      description: body.description ?? null,
      price_brl: body.price_brl ?? null,
      benefits: JSON.stringify(body.benefits ?? []),
      inventory_items: JSON.stringify(body.inventory_items ?? []),
      sort_order: body.sort_order ?? (count ?? 0),
    } as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_package",
    entity_id: (data as { id: string }).id,
    action: "proposal_package.created",
    metadata: { proposal_id: proposalId, name: body.name },
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(
  req: Request,
  ctx: { params: { id: string } }
) {
  // Replace all packages for this proposal
  const sb = supabaseAdmin();
  const proposalId = ctx.params.id;
  const body = await req.json().catch(() => ({})) as {
    packages: Array<{
      id?: string;
      name: string;
      description?: string;
      price_brl?: number;
      benefits?: string[];
      inventory_items?: Record<string, unknown>[];
      sort_order?: number;
    }>;
  };

  if (!Array.isArray(body.packages)) {
    return NextResponse.json({ error: "packages array required" }, { status: 400 });
  }

  // Soft-delete all existing
  await sb
    .from("proposal_packages")
    .update({ active: false } as never)
    .eq("proposal_id", proposalId);

  if (body.packages.length > 0) {
    const rows = body.packages.map((p, idx) => ({
      proposal_id: proposalId,
      name: p.name,
      description: p.description ?? null,
      price_brl: p.price_brl ?? null,
      benefits: JSON.stringify(p.benefits ?? []),
      inventory_items: JSON.stringify(p.inventory_items ?? []),
      sort_order: p.sort_order ?? idx,
      active: true,
    }));

    const { error } = await sb.from("proposal_packages").insert(rows as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = await sb
    .from("proposal_packages")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("active", true)
    .order("sort_order");

  return NextResponse.json({ data: data ?? [] });
}

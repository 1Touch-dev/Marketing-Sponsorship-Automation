import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SequenceStep = {
  step: number;
  flow_type: "intro" | "follow_up" | "negotiation" | "barter";
  template_id?: string | null;
  delay_days: number;
  tone?: "warm" | "formal" | "urgent" | null;
};

function migrationPending(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find|not find/i.test(error.message ?? "")
  );
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("email_sequences")
    .select("*")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");

  if (migrationPending(error)) return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    steps?: SequenceStep[];
    is_default?: boolean;
  };

  if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "name and at least one step are required" }, { status: 400 });
  }

  const steps = body.steps.map((s, i) => ({
    step: i + 1,
    flow_type: s.flow_type,
    template_id: s.template_id ?? null,
    delay_days: Number.isFinite(s.delay_days) ? Math.max(0, s.delay_days) : 0,
  }));

  if (body.is_default) {
    await sb.from("email_sequences").update({ is_default: false } as never).eq("is_default", true as never);
  }

  const { data, error } = await sb
    .from("email_sequences")
    .insert({
      name: body.name,
      description: body.description ?? null,
      steps: JSON.stringify(steps),
      is_default: body.is_default ?? false,
    } as never)
    .select("*")
    .single();

  if (migrationPending(error)) {
    return NextResponse.json({ error: "Run migration 0038_email_flows.sql first", migration_pending: true }, { status: 422 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_sequence",
    entity_id: (data as { id: string }).id,
    action: "email_sequence.created",
    metadata: { name: body.name, steps: steps.length },
  });

  return NextResponse.json({ data }, { status: 201 });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { userActor } from "@/lib/identity/actor";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import {
  DEFAULT_NEWSLETTER_SETTINGS,
  DEFAULT_SEGMENT_NAME,
  parseNewsletterSettingsPut,
  rowToSettings,
  settingsToRow,
} from "@/lib/newsletter/settings";

export const runtime = "nodejs";

function missing(error: { message?: string; code?: string } | null | undefined) {
  return isMissingMigration(error) || (error?.message ?? "").toLowerCase().includes("newsletter_segments");
}

export async function GET() {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("newsletter_segments" as "companies")
    .select("*")
    .eq("tenant_id" as "id", tenantId)
    .eq("name" as "id", DEFAULT_SEGMENT_NAME)
    .maybeSingle();

  if (missing(error)) {
    return NextResponse.json({ ...DEFAULT_NEWSLETTER_SETTINGS, migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(rowToSettings((data ?? null) as Record<string, unknown> | null));
}

export async function PUT(req: Request) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const parsed = parseNewsletterSettingsPut(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const sb = supabaseAdmin();
  const row = settingsToRow(parsed.data);
  const payload = { ...row, tenant_id: auth.user.tenant_id, updated_at: new Date().toISOString() };

  const { data: existing, error: findErr } = await sb
    .from("newsletter_segments" as "companies")
    .select("id")
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .eq("name" as "id", DEFAULT_SEGMENT_NAME)
    .maybeSingle();

  if (missing(findErr)) {
    return NextResponse.json({ error: "Database migration required", migration_needed: true }, { status: 503 });
  }
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  const existingId = (existing as { id?: string } | null)?.id;
  const query = existingId
    ? (sb as ReturnType<typeof supabaseAdmin>)
        .from("newsletter_segments" as "companies")
        .update(payload as never)
        .eq("id", existingId)
        .eq("tenant_id" as "id", auth.user.tenant_id)
        .select("*")
        .single()
    : (sb as ReturnType<typeof supabaseAdmin>)
        .from("newsletter_segments" as "companies")
        .insert(payload as never)
        .select("*")
        .single();

  const { data, error } = await query;
  if (missing(error)) {
    return NextResponse.json({ error: "Database migration required", migration_needed: true }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    actor: userActor(auth.user),
    entity_type: "newsletter",
    entity_id: (data as { id?: string } | null)?.id ?? null,
    action: "newsletter.settings_saved",
    metadata: { header_title: parsed.data.blocks.header.title, subject: parsed.data.subject },
  });

  return NextResponse.json(rowToSettings(data as Record<string, unknown>));
}

import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import { userMeUpdateSchema } from "@/lib/validators";
import { buildCalendarUrlUpdate } from "@/lib/users/me-calendar";
import { isMissingCalendarUrlColumn } from "@/lib/proposals/meeting-link";

export const runtime = "nodejs";

export async function GET() {
  const supabase = supabaseServer();

  // getUser() contacts the Supabase Auth server — more secure than getSession()
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Look up platform_users for role
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .eq("email" as "id", email)
    .eq("is_active" as "id", true as unknown as string)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "User not found or inactive", user: null }, { status: 403 });
  }

  // Fire-and-forget last_seen_at update
  const userId = (data as unknown as { id: string }).id;
  sb.from("platform_users" as "companies")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id" as "id", userId)
    .then(() => {/* no-op */});

  return NextResponse.json({ user: data });
}

/**
 * PATCH /api/users/me — update only the signed-in user's calendar_url.
 * Any active platform role (including viewer). Never spreads body; never
 * accepts id/role from the client (self-privilege-escalation hardening).
 */
export async function PATCH(req: Request) {
  const me = await getCurrentPlatformUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = userMeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  // Not sent → nothing to update (ignore forbidden keys like role if present alone)
  if (!("calendar_url" in parsed.data) || parsed.data.calendar_url === undefined) {
    return NextResponse.json({ error: "calendar_url is required" }, { status: 400 });
  }

  const update = buildCalendarUrlUpdate(parsed.data.calendar_url);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .update(update as unknown as Record<string, unknown>)
    .eq("id" as "id", me.id)
    .eq("tenant_id" as "id", me.tenant_id)
    .select()
    .single();

  if (error) {
    if (isMissingCalendarUrlColumn(error)) {
      return NextResponse.json(
        { error: "calendar_url column missing — run migration 0079 in Supabase before saving." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

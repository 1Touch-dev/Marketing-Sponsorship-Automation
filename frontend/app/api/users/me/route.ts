import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

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

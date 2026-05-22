import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();
  const headerStore = headers();
  const email = headerStore.get("x-user-email");

  // Build base query
  const base = sb
    .from("platform_users" as "companies")
    .select("*");

  // Apply filter — branch to avoid complex generic chaining
  const { data, error } = email
    ? await base.eq("email" as "id", email.toLowerCase()).maybeSingle()
    : await base.eq("role" as "id", "admin").maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ user: null }, { status: 404 });

  // Fire-and-forget last_seen_at update
  const userId = (data as unknown as { id: string }).id;
  sb.from("platform_users" as "companies")
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id" as "id", userId)
    .then(() => {/* no-op */});

  return NextResponse.json({ user: data });
}

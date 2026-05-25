import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (!data.session || !data.user) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  // Verify the user is in platform_users and is active
  const sb = supabaseAdmin();
  const { data: platformUser, error: puError } = await sb
    .from("platform_users" as "companies")
    .select("id, email, full_name, role, is_active")
    .eq("email" as "id", email.toLowerCase().trim())
    .eq("is_active" as "id", true as unknown as string)
    .maybeSingle();

  if (puError || !platformUser) {
    // Revoke the session — user authenticated in Supabase Auth but not in our platform
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Your account is not authorized for this platform. Contact your admin." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    user: platformUser,
    message: "Login successful",
  });
}

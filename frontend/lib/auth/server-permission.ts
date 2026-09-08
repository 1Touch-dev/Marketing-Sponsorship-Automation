import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { can, type Permission, type PlatformUser } from "@/lib/auth/roles";

/**
 * Server-side RBAC enforcement (Phase 5 audit finding, 2026-09-08).
 *
 * lib/auth/roles.ts's permission matrix and <RoleGate> only ever hid UI
 * elements — nothing on the server checked a caller's actual role before
 * this. Confirmed live: any authenticated user, any role including
 * 'viewer', could PATCH their own platform_users row to role: 'admin' via
 * a direct API call, or approve/send/delete anything, because 120 of the
 * 122 mutating routes in this codebase (including user management itself)
 * had zero server-side permission check. This is the reusable helper for
 * closing that — same identity resolution as the existing /api/users/me.
 */
export async function getCurrentPlatformUser(): Promise<PlatformUser | null> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .eq("email" as "id", email)
    .eq("is_active" as "id", true as unknown as string)
    .maybeSingle();

  return (data as unknown as PlatformUser | null) ?? null;
}

/**
 * Use at the top of a mutating route handler:
 *   const auth = await requirePermission("manage_users");
 *   if ("error" in auth) return auth.error;
 *   // auth.user is the verified PlatformUser from here on
 */
export async function requirePermission(
  permission: Permission,
): Promise<{ user: PlatformUser } | { error: NextResponse }> {
  const user = await getCurrentPlatformUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(user.role, permission)) {
    return {
      error: NextResponse.json(
        { error: `Role "${user.role}" is not permitted to perform "${permission}".` },
        { status: 403 },
      ),
    };
  }
  return { user };
}

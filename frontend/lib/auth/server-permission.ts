import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { timingSafeEqual } from "node:crypto";
import { can, type Permission, type PlatformUser } from "@/lib/auth/roles";
import { userActor, internalActor, type Actor } from "@/lib/identity/actor";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";

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

function hasValidInternalSecret(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-internal-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Same gate as requirePermission(), but also accepts an unattended caller
 * (cron/n8n) presenting the same INTERNAL_API_SECRET used by
 * requireInternalAuth() for /api/internal and /api/system routes. For
 * scheduler-pattern endpoints (detect-cold, email-sequences/advance,
 * gmail/sync-threads) that need to work BOTH from a human clicking a UI
 * button (session cookie) AND from an unattended trigger with no session
 * at all — these previously 401'd for any caller without a browser
 * session, so no cron job could ever actually reach them.
 */
export async function requirePermissionOrInternal(
  req: Request,
  permission: Permission,
): Promise<{ user: PlatformUser | null } | { error: NextResponse }> {
  if (hasValidInternalSecret(req)) {
    return { user: null };
  }
  return requirePermission(permission);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who is calling, which club (tenant) they act for, and the actor to write in the audit log. */
export interface Caller {
  /** The signed-in person; null when the caller is the app itself (or a scheduler) holding the internal secret. */
  user: PlatformUser | null;
  tenantId: string;
  actor: Actor;
}

/**
 * For routes the app also calls on itself (competitor discovery, enrichment, follow-up and email drafts): open to a
 * signed-in person with the permission, OR to an unattended caller presenting INTERNAL_API_SECRET.
 *
 * A person acts for their own tenant. An internal caller says which tenant with the x-tenant-id header (the secret
 * holder is trusted; a malformed value is refused, never guessed). With no header it is the default club, the same
 * rule every other scheduler endpoint uses. Without a valid secret the call is exactly as strict as requirePermission.
 */
export async function requireCaller(
  req: Request,
  permission: Permission,
): Promise<Caller | { error: NextResponse }> {
  if (hasValidInternalSecret(req)) {
    const asked = req.headers.get("x-tenant-id")?.trim();
    if (asked && !UUID.test(asked)) {
      return { error: NextResponse.json({ error: "x-tenant-id must be a UUID" }, { status: 400 }) };
    }
    return { user: null, tenantId: asked || CORITIBA_TENANT_ID, actor: internalActor(req) };
  }
  const auth = await requirePermission(permission);
  if ("error" in auth) return auth;
  return { user: auth.user, tenantId: auth.user.tenant_id, actor: userActor(auth.user) };
}

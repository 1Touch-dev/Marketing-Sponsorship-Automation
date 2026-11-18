import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import {
  findAuthUserByEmail,
  issuePasswordLinkEmail,
  listAuthEmailsLower,
  passwordLinkAuditMeta,
} from "@/lib/auth/password-links";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";

// GET /api/users — list all platform users (scoped to the caller's own tenant)
export async function GET() {
  const auth = await requirePermission("manage_users");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .eq("tenant_id" as "id", tenantId)
    .order("created_at" as "id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let authEmails = new Set<string>();
  try {
    authEmails = await listAuthEmailsLower();
  } catch {
    // Enrichment is best-effort; UI can still manage roles without has_auth_user.
  }

  const users = (data ?? []).map((u) => {
    const row = u as { email?: string };
    const email = (row.email ?? "").toLowerCase();
    return { ...u, has_auth_user: email ? authEmails.has(email) : false };
  });

  return NextResponse.json({ users });
}

// POST /api/users — invite a new user (platform_users + Auth + SES set-password link)
export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.full_name || !body?.role) {
    return NextResponse.json({ error: "email, full_name and role are required" }, { status: 400 });
  }

  const validRoles: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const email = String(body.email).trim().toLowerCase();
  const fullName = String(body.full_name).trim();
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("platform_users" as "companies")
    .select("id")
    .eq("email" as "id", email)
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const { data, error } = await sb
    .from("platform_users" as "companies")
    .insert({
      tenant_id: auth.user.tenant_id,
      email,
      full_name: fullName,
      role: body.role,
      invited_by: body.invited_by ?? auth.user.email,
    } as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await issuePasswordLinkEmail({
      tenantId: auth.user.tenant_id,
      email,
      kind: "invite",
      appUrl: resolveAppUrl(req),
    });
  } catch (err) {
    const authUser = await findAuthUserByEmail(email).catch(() => null);
    await recordAudit({
      actor: userActor(auth.user),
      entity_type: "platform_user",
      entity_id: (data as { id: string }).id,
      action: "auth.user_invited",
      tenant_id: auth.user.tenant_id,
      metadata: {
        ...passwordLinkAuditMeta(email, "invite"),
        email_sent: false,
        error: err instanceof Error ? err.message.slice(0, 200) : "send failed",
      },
    });
    return NextResponse.json(
      {
        error: authUser
          ? "User was created, but the email could not be sent. Use Send reset link."
          : "User was created in Login accounts, but the set-password email could not be sent. Use Resend invite.",
        user: { ...data, has_auth_user: Boolean(authUser) },
      },
      { status: 502 },
    );
  }

  await recordAudit({
    actor: userActor(auth.user),
    entity_type: "platform_user",
    entity_id: (data as { id: string }).id,
    action: "auth.user_invited",
    tenant_id: auth.user.tenant_id,
    metadata: { ...passwordLinkAuditMeta(email, "invite"), email_sent: true },
  });

  return NextResponse.json({ user: { ...data, has_auth_user: true }, email_sent: true }, { status: 201 });
}

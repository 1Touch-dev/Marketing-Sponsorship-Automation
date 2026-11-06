import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import {
  deliveryCountsByNewsletter,
  newsletterUnsubscribes,
} from "@/lib/mail/newsletter-analytics";
import type { Permission, PlatformUser } from "@/lib/auth/roles";

type RequirePermission = (
  permission: Permission,
) => Promise<{ user: PlatformUser } | { error: NextResponse }>;

/**
 * Staff-only analytics. Kept out of route.ts so Next.js only sees valid
 * route exports; tests inject an unauthorized requirePermission.
 */
export async function handleNewsletterAnalyticsGet(
  requirePerm: RequirePermission = requirePermission,
): Promise<NextResponse> {
  const auth = await requirePerm("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const tenantId = auth.user.tenant_id;

  const { data: newsletters, error: nlErr } = await sb
    .from("newsletters")
    .select("id, subject, status, sent_at, created_at, recipient_count")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (nlErr) {
    if (isMissingMigration(nlErr)) {
      return NextResponse.json({ newsletters: [], unsubscribes: [], migration_needed: true });
    }
    return NextResponse.json({ error: nlErr.message }, { status: 500 });
  }

  const rows = (newsletters ?? []) as Array<{
    id: string;
    subject: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    recipient_count: number | null;
  }>;

  const countsResult = await deliveryCountsByNewsletter(
    sb,
    tenantId,
    rows.map((r) => r.id),
  );
  if (!countsResult.ok) {
    if (countsResult.missing) {
      return NextResponse.json({
        newsletters: rows.map((r) => ({
          id: r.id,
          subject: r.subject,
          status: r.status,
          sent_at: r.sent_at,
          created_at: r.created_at,
          recipient_count: r.recipient_count ?? 0,
          deliveries: {},
        })),
        unsubscribes: [],
        migration_needed: true,
      });
    }
    return NextResponse.json({ error: countsResult.error }, { status: 500 });
  }

  const unsubResult = await newsletterUnsubscribes(sb, tenantId);
  if (!unsubResult.ok) {
    if (unsubResult.missing) {
      return NextResponse.json({
        newsletters: rows.map((r) => ({
          id: r.id,
          subject: r.subject,
          status: r.status,
          sent_at: r.sent_at,
          created_at: r.created_at,
          recipient_count: r.recipient_count ?? 0,
          deliveries: countsResult.counts[r.id] ?? {},
        })),
        unsubscribes: [],
        migration_needed: true,
      });
    }
    return NextResponse.json({ error: unsubResult.error }, { status: 500 });
  }

  return NextResponse.json({
    newsletters: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      sent_at: r.sent_at,
      created_at: r.created_at,
      recipient_count: r.recipient_count ?? 0,
      deliveries: countsResult.counts[r.id] ?? {},
    })),
    unsubscribes: unsubResult.rows,
  });
}

import { listCurrentSuppressions } from "@/lib/contacts/store";
import { isMissingMigration } from "@/lib/proposals/revision-store";

type Sb = any;

export const DELIVERY_STATUSES = [
  "queued",
  "accepted",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "skipped",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type DeliveryCounts = Partial<Record<DeliveryStatus, number>>;

const LEGACY_STATUSES = new Set(["sent", "partial", "failed"]);

/**
 * Exact per-status counts without selecting delivery rows (avoids PostgREST's
 * ~1000-row response cap that under-counts large newsletters).
 */
export async function deliveryCountsByNewsletter(
  sb: Sb,
  tenantId: string,
  newsletterIds: string[],
): Promise<{ ok: true; counts: Record<string, DeliveryCounts> } | { ok: false; missing: boolean; error: string }> {
  const ids = [...new Set(newsletterIds.filter(Boolean))];
  const counts: Record<string, DeliveryCounts> = {};
  for (const id of ids) counts[id] = {};
  if (ids.length === 0) return { ok: true, counts };

  try {
    const results = await Promise.all(
      ids.flatMap((id) =>
        DELIVERY_STATUSES.map(async (status) => {
          const { count, error } = await sb
            .from("newsletter_deliveries")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("newsletter_id", id)
            .eq("status", status);
          return { id, status, count: count ?? 0, error };
        }),
      ),
    );

    for (const r of results) {
      if (r.error) {
        if (isMissingMigration(r.error)) return { ok: false, missing: true, error: r.error.message };
        return { ok: false, missing: false, error: r.error.message };
      }
      if (r.count > 0) {
        counts[r.id][r.status] = r.count;
      }
    }
    return { ok: true, counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, missing: /does not exist|42P01/i.test(message), error: message };
  }
}

export type NewsletterUnsubscribe = { email: string; since: string; note: string | null };

/** Current do-not-contact rows created by the newsletter unsubscribe link. */
export async function newsletterUnsubscribes(
  sb: Sb,
  tenantId: string,
): Promise<{ ok: true; rows: NewsletterUnsubscribe[] } | { ok: false; missing: boolean; error: string }> {
  const listed = await listCurrentSuppressions(sb, tenantId);
  if (!listed.ok) {
    return { ok: false, missing: listed.status === 503, error: listed.error };
  }
  const rows = listed.value
    .filter((r) => r.source === "newsletter_unsubscribe" && !!r.email)
    .map((r) => ({ email: r.email as string, since: r.since, note: r.note }));
  return { ok: true, rows };
}

function totalDeliveries(c: DeliveryCounts | undefined): number {
  if (!c) return 0;
  return Object.values(c).reduce((s, n) => s + (n ?? 0), 0);
}

/**
 * "5 accepted · 1 bounced". For finished newsletters with no delivery rows
 * (pre-migration 0077), show an honest legacy label instead of a blank line.
 */
export function countsLine(
  deliveries: DeliveryCounts | undefined,
  newsletterStatus?: string | null,
): string {
  const total = totalDeliveries(deliveries);
  if (total === 0) {
    if (newsletterStatus && LEGACY_STATUSES.has(newsletterStatus)) {
      return "no delivery records (legacy)";
    }
    return "";
  }
  return (DELIVERY_STATUSES as readonly string[])
    .filter((k) => deliveries?.[k as DeliveryStatus])
    .map((k) => `${deliveries![k as DeliveryStatus]} ${k}`)
    .join(" · ");
}

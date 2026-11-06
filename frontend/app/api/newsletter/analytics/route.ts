import { handleNewsletterAnalyticsGet } from "@/lib/mail/newsletter-analytics-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/newsletter/analytics
 * Staff-only: past newsletters with accurate delivery status counts, plus
 * addresses currently suppressed via newsletter unsubscribe. Lists emails.
 */
export async function GET() {
  return handleNewsletterAnalyticsGet();
}

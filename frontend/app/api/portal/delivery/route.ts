import { portalGet } from "@/lib/portal/route";
import { portalDelivery } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/delivery: each item this sponsor bought and where it stands; proof shows once the club has accepted it. */
export const GET = portalGet((sb, ctx) => portalDelivery(sb, ctx));

import { portalGet } from "@/lib/portal/route";
import { portalRecaps } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/recaps: the delivery recaps the club has issued to this sponsor. */
export const GET = portalGet((sb, ctx) => portalRecaps(sb, ctx));

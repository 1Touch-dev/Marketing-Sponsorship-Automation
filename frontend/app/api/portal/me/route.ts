import { portalGet } from "@/lib/portal/route";
import { portalMe } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/me: who this sponsor session is, and the club it belongs to. */
export const GET = portalGet((sb, ctx) => portalMe(sb, ctx));

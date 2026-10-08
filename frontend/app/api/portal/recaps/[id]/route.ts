import { portalGet } from "@/lib/portal/route";
import { portalRecap } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/recaps/<id>: one issued recap: what was promised, delivered and measured. Not the club's finances. */
export const GET = portalGet((sb, ctx, params) => portalRecap(sb, ctx, params.id));

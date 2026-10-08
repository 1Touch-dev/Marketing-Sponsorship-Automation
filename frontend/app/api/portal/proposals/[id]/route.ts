import { portalGet } from "@/lib/portal/route";
import { portalProposal } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/proposals/<id>: one of this sponsor's proposals, with its packages. Anyone else's is "not found". */
export const GET = portalGet((sb, ctx, params) => portalProposal(sb, ctx, params.id));

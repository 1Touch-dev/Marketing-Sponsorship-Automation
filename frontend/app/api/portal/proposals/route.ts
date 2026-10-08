import { portalGet } from "@/lib/portal/route";
import { portalProposals } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/proposals: this sponsor's proposals that the club has approved or sent. Drafts and proposals under review are not shown. */
export const GET = portalGet((sb, ctx) => portalProposals(sb, ctx));

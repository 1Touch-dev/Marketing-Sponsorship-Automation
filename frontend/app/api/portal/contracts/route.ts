import { portalGet } from "@/lib/portal/route";
import { portalContracts } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/contracts: this sponsor's signed contracts. */
export const GET = portalGet((sb, ctx) => portalContracts(sb, ctx));

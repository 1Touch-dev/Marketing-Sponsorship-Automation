import { portalGet } from "@/lib/portal/route";
import { portalProofFile } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/delivery/<id>/proof/<fileId>: a short-lived address for the file the club accepted as proof for this item. */
export const GET = portalGet((sb, ctx, params) => portalProofFile(sb, ctx, params.id, params.fileId));

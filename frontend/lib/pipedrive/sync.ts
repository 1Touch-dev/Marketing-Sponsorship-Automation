const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

interface PipedriveResult { success: boolean; data?: Record<string, unknown>; error?: string }

async function pipedriveFetch(path: string, method = "GET", body?: unknown): Promise<PipedriveResult> {
  if (!PIPEDRIVE_API_KEY) return { success: false, error: "No Pipedrive API key" };
  try {
    const res = await fetch(`${PIPEDRIVE_BASE}${path}?api_token=${PIPEDRIVE_API_KEY}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { success: boolean; data: Record<string, unknown>; error?: string };
    if (!data.success) return { success: false, error: data.error ?? "Pipedrive error" };
    return { success: true, data: data.data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createOrUpdateDeal(opts: {
  title: string;
  orgName: string;
  value?: number;
  status?: "open" | "won" | "lost";
  proposalId?: string;
  proposalUrl?: string;
}): Promise<PipedriveResult> {
  // Search for existing deal with same title
  const search = await pipedriveFetch(`/deals/search?term=${encodeURIComponent(opts.title)}&limit=1`);
  const existingDeal = (search.data as { items?: Array<{ item: { id: number } }> } | undefined)?.items?.[0]?.item;

  const dealBody = {
    title: opts.title,
    value: opts.value ?? 0,
    status: opts.status ?? "open",
    ...(opts.proposalId && { "fd2bc3e6c84f6c01": opts.proposalId }), // custom field — ignored if not configured
  };

  if (existingDeal) {
    return pipedriveFetch(`/deals/${existingDeal.id}`, "PUT", dealBody);
  }

  // Create new deal
  const deal = await pipedriveFetch("/deals", "POST", dealBody);

  // Add note with proposal link if available
  if (deal.success && deal.data && opts.proposalUrl) {
    const dealId = (deal.data as { id: number }).id;
    await pipedriveFetch("/notes", "POST", {
      content: `Proposta enviada: ${opts.proposalUrl}`,
      deal_id: dealId,
    });
  }

  return deal;
}

export async function logActivity(opts: {
  dealTitle: string;
  activityType: string;
  note: string;
}): Promise<PipedriveResult> {
  // Find deal
  const search = await pipedriveFetch(`/deals/search?term=${encodeURIComponent(opts.dealTitle)}&limit=1`);
  const deal = (search.data as { items?: Array<{ item: { id: number } }> } | undefined)?.items?.[0]?.item;
  if (!deal) return { success: false, error: "Deal not found" };

  return pipedriveFetch("/activities", "POST", {
    subject: opts.activityType,
    type: "note",
    note: opts.note,
    deal_id: deal.id,
    done: 1,
  });
}

// ── Legacy CRM queue helpers (used by crm/route, approve/route, etc.) ────────

export function isPipedriveConfigured(): boolean {
  return !!PIPEDRIVE_API_KEY;
}

export interface CrmSyncOpts {
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete" | "status_change";
  payload?: Record<string, unknown>;
}

export interface CrmSyncResult {
  sync_status: "synced" | "failed" | "skipped" | "queued";
  result: Record<string, unknown>;
}

export async function enqueueCrmSync(opts: CrmSyncOpts): Promise<CrmSyncResult> {
  if (!isPipedriveConfigured()) {
    return { sync_status: "queued", result: {} };
  }
  try {
    const result = await dispatchToPipedrive(
      opts.entity_type,
      opts.entity_id,
      opts.operation,
      opts.payload ?? {},
    );
    return { sync_status: "synced", result };
  } catch (e) {
    return { sync_status: "failed", result: { error: String(e) } };
  }
}

export async function dispatchToPipedrive(
  entityType: string,
  entityId: string,
  operation: "create" | "update" | "delete" | "status_change",
  payload: Record<string, unknown>,
  _sb?: unknown, // eslint-disable-line
): Promise<Record<string, unknown>> {
  if (entityType === "proposal") {
    const dealId = payload.pipedrive_deal_id as number | undefined;
    const newStatus = payload.new_status as string | undefined;
    const title = (payload.title as string) ?? entityId;

    if (operation === "delete" && dealId) {
      await pipedriveFetch(`/deals/${dealId}`, "DELETE");
      return { deleted: true };
    }

    if ((operation === "update" || operation === "status_change") && dealId) {
      const pipedriveStatus =
        newStatus === "won" ? "won" : newStatus === "rejected" ? "lost" : "open";
      const res = await pipedriveFetch(`/deals/${dealId}`, "PUT", {
        status: pipedriveStatus,
        ...(newStatus && { stage_id: undefined }),
      });
      return res.data ?? {};
    }

    // create
    const dealRes = await pipedriveFetch("/deals", "POST", {
      title,
      status: "open",
    });
    return dealRes.data ?? {};
  }

  return {};
}

export async function resolveProposalPipedriveIds(
  sb: { from: (t: string) => unknown },
  proposalId: string,
): Promise<{ dealId: number | null; orgId: number | null; pipelineId: number | null }> {
  try {
    const q = (sb.from("proposals") as {
      select: (s: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
    })
      .select("content, companies(full_intelligence)")
      .eq("id", proposalId)
      .maybeSingle();

    const { data } = await q;
    if (!data) return { dealId: null, orgId: null, pipelineId: null };

    const content = (data.content as Record<string, unknown>) ?? {};
    const company = (data.companies as Record<string, unknown> | null) ?? {};
    const intel = (company.full_intelligence as Record<string, unknown>) ?? {};

    return {
      dealId: (content.pipedrive_deal_id as number) ?? (intel.pipedrive_deal_id as number) ?? null,
      orgId: (content.pipedrive_org_id as number) ?? (intel.pipedrive_org_id as number) ?? null,
      pipelineId: (content.pipedrive_pipeline_id as number) ?? null,
    };
  } catch {
    return { dealId: null, orgId: null, pipelineId: null };
  }
}

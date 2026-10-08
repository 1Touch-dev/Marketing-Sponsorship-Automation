import { loadSponsorClaims } from "./sponsor-claims";
import { documentClaimKeys, documentClaimsReport, type DocumentClaimsReport } from "./document-claims";
import { findUnsourcedFigures, type UnsourcedFigure } from "./figure-scan";

type Sb = any;

export interface ProposalClaimsReport extends DocumentClaimsReport {
  /** Figures written into the proposal text that no usable claim states. For the approver to check. */
  unsourced_text_figures: UnsourcedFigure[];
  registry_available: boolean;
}

const TEXT_FIELDS = ["executive_summary", "campaign_rationale", "sponsorship_value", "activation_plan", "investment_note", "cta"] as const;

/** What a sponsor would be shown for this proposal, and which figures in its text are unsupported. */
export async function buildProposalClaimsReport(
  sb: Sb,
  tenantId: string,
  proposal: { content?: unknown; strategy_variants?: unknown },
): Promise<ProposalClaimsReport> {
  const content = (proposal.content ?? {}) as Record<string, unknown>;
  const sponsor = await loadSponsorClaims(sb, tenantId);
  const doc = documentClaimsReport(sponsor, documentClaimKeys(content.kpi_template_id as string | undefined));

  const fields: Record<string, string> = {};
  for (const f of TEXT_FIELDS) if (typeof content[f] === "string") fields[f] = content[f] as string;
  if (Array.isArray(content.deliverables)) {
    content.deliverables.forEach((d, i) => { if (typeof d === "string") fields[`deliverable_${i + 1}`] = d; });
  }
  if (Array.isArray(proposal.strategy_variants)) {
    (proposal.strategy_variants as Array<Record<string, unknown>>).forEach((v, i) => {
      for (const k of ["estimated_reach", "audience_fit"]) if (typeof v?.[k] === "string") fields[`strategy_${i + 1}_${k}`] = v[k] as string;
    });
  }

  return {
    ...doc,
    unsourced_text_figures: findUnsourcedFigures(fields, Object.values(sponsor.claims).map((c) => c.value)),
    registry_available: sponsor.available,
  };
}

import { Badge } from "@/components/ui/badge";
import type {
  CampaignStatus,
  CompanyStatus,
  EmailStatus,
  FollowupStatus,
  ProposalStatus,
} from "@/types/database";

type AnyStatus =
  | ProposalStatus
  | CampaignStatus
  | CompanyStatus
  | EmailStatus
  | FollowupStatus
  | string;

const VARIANT_MAP: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline"> = {
  // proposals
  draft: "secondary",
  under_review: "info",
  revision_requested: "warning",
  approved: "success",
  scheduled: "info",
  sent: "success",
  rejected: "destructive",
  active_contract: "success",
  // emails
  pending_approval: "warning",
  sending: "info",
  opened: "info",
  replied: "success",
  bounced: "destructive",
  failed: "destructive",
  received: "info",
  // companies
  competitor: "destructive",
  prospect: "outline",
  active: "success",
  paused: "warning",
  closed: "secondary",
  // followups
  pending: "outline",
  suggested: "info",
  // campaigns
  selected: "success",
  archived: "secondary",
};

const LABEL_MAP: Record<string, string> = {
  active_contract: "Active / In Contract",
  under_review: "Under Review",
  revision_requested: "Revision Requested",
  pending_approval: "Pending Approval",
  sending: "Sending…",
};

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: AnyStatus }) {
  const variant = VARIANT_MAP[status] ?? "outline";
  // Found in the 2026-09-23 UX audit: statuses not in LABEL_MAP rendered
  // lowercase ("draft", "approved") right next to Title Case ones ("Under
  // Review") in the same list — title-casing every fallback makes casing
  // consistent everywhere this badge is used.
  const label = LABEL_MAP[status] ?? titleCase(status);
  return <Badge variant={variant}>{label}</Badge>;
}

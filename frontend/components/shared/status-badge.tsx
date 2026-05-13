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
  // emails
  pending_approval: "warning",
  opened: "info",
  replied: "success",
  bounced: "destructive",
  failed: "destructive",
  // companies
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

export function StatusBadge({ status }: { status: AnyStatus }) {
  const variant = VARIANT_MAP[status] ?? "outline";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

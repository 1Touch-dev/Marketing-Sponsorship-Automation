/**
 * Minimal hand-typed Database type for Supabase JS.
 *
 * For a full generated type, run:
 *   npx supabase gen types typescript --project-id <ref> --schema public > frontend/types/database.generated.ts
 *
 * The shape below is sufficient for type-safety in the MVP.
 */

export type UserRole = "admin" | "reviewer" | "editor" | "viewer";
export type CompanyStatus = "prospect" | "active" | "paused" | "closed";
export type CampaignStatus = "draft" | "selected" | "archived";
export type ProposalStatus =
  | "draft"
  | "under_review"
  | "revision_requested"
  | "approved"
  | "scheduled"
  | "sent"
  | "rejected";
export type ApprovalDecision = "approve" | "reject" | "request_revision";
export type EmailStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "opened"
  | "replied"
  | "bounced"
  | "failed";
export type FollowupStatus = "pending" | "suggested" | "scheduled" | "sent" | "closed";

export interface User {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: UserRole;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  country: string | null;
  notes: string | null;
  status: CompanyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  company_id: string;
  title: string;
  summary: string | null;
  activation: string | null;
  cta: string | null;
  description: string | null;
  objective: string | null;
  raw_output: unknown;
  generated_by: string | null;
  model_id: string | null;
  prompt_version: string | null;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalContent {
  title?: string;
  executive_summary?: string;
  campaign_rationale?: string;
  sponsorship_value?: string;
  activation_plan?: string;
  deliverables?: string[];
  investment_note?: string;
  cta?: string;
  [k: string]: unknown;
}

export interface Proposal {
  id: string;
  company_id: string;
  campaign_id: string | null;
  title: string;
  content: ProposalContent;
  content_md: string | null;
  status: ProposalStatus;
  status_reason: string | null;
  version: number;
  generated_by: string | null;
  model_id: string | null;
  prompt_version: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  version: number;
  content: ProposalContent;
  content_md: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  proposal_id: string;
  reviewer_id: string | null;
  decision: ApprovalDecision;
  comments: string | null;
  created_at: string;
}

export interface EmailThread {
  id: string;
  proposal_id: string | null;
  company_id: string | null;
  gmail_thread_id: string | null;
  subject: string | null;
  participants: string[] | null;
  last_message_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EmailRow {
  id: string;
  proposal_id: string | null;
  thread_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  direction: string;
  sender: string | null;
  recipient: string;
  cc: string[] | null;
  bcc: string[] | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: EmailStatus;
  status_reason: string | null;
  generated_by: string | null;
  prompt_version: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Followup {
  id: string;
  proposal_id: string | null;
  thread_id: string | null;
  parent_email_id: string | null;
  draft_email_id: string | null;
  suggested_body: string | null;
  reason: string | null;
  scheduled_for: string | null;
  status: FollowupStatus;
  status_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkflowEventStatus = "started" | "processing" | "completed" | "failed" | "retried";

export interface WorkflowEvent {
  id: string;
  workflow_name: string;
  entity_type: string | null;
  entity_id: string | null;
  status: WorkflowEventStatus;
  error_message: string | null;
  attempt: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type InsertOf<T> = Partial<Omit<T, "id" | "created_at" | "updated_at">>;
type UpdateOf<T> = Partial<Omit<T, "id" | "created_at">>;
type Tbl<T> = { Row: T; Insert: InsertOf<T>; Update: UpdateOf<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      users:             Tbl<User>;
      companies:         Tbl<Company>;
      campaigns:         Tbl<Campaign>;
      proposals:         Tbl<Proposal>;
      proposal_versions: Tbl<ProposalVersion>;
      approvals:         Tbl<Approval>;
      email_threads:     Tbl<EmailThread>;
      emails:            Tbl<EmailRow>;
      followups:         Tbl<Followup>;
      audit_logs:        Tbl<AuditLog>;
      workflow_events:   Tbl<WorkflowEvent>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      company_status: CompanyStatus;
      campaign_status: CampaignStatus;
      proposal_status: ProposalStatus;
      approval_decision: ApprovalDecision;
      email_status: EmailStatus;
      followup_status: FollowupStatus;
    };
  };
}

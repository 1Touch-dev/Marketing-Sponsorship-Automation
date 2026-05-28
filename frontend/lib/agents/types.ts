/**
 * Agent types — shared across all agent files.
 */

export type AgentMode = "supervised" | "auto";

export type AgentStatus =
  | "running"
  | "completed"
  | "failed"
  | "paused_for_approval"
  | "cancelled";

export type AgentStepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type AgentStep = {
  step: number;
  tool: string;
  status: AgentStepStatus;
  label: string;
  result?: Record<string, unknown>;
  error?: string;
  started_at: string;
  finished_at?: string;
};

export type AgentRun = {
  id: string;
  company_id: string;
  created_by: string | null;
  status: AgentStatus;
  mode: AgentMode;
  steps: AgentStep[];
  result: AgentResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentResult = {
  proposal_id?: string;
  proposal_title?: string;
  email_id?: string;
  email_subject?: string;
  email_preview?: string;
  recipient?: string;
  recipient_name?: string;
  pipedrive_activity_id?: number | null;
  contacts_found?: number;
  decision_makers?: number;
  social_score?: number;
  steps_completed?: number;
  total_tokens?: number;
  completed_at?: string;
};

// SSE event shapes streamed to the browser
export type SSEEvent =
  | { type: "started"; run_id: string; company_name: string; mode: AgentMode }
  | { type: "step"; step: number; tool: string; status: "running" | "done" | "error" | "skipped"; label: string; result?: Record<string, unknown>; error?: string }
  | { type: "paused"; reason: "email_review"; email_id: string; email_subject: string; email_preview: string; recipient: string; recipient_name: string }
  | { type: "done"; run_id: string; summary: string; result: AgentResult }
  | { type: "error"; message: string; run_id?: string };

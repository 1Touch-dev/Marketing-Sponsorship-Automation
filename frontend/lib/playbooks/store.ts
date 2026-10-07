import { isMissingMigration } from "../proposals/revision-store";
import { loadStage } from "../accounts/store";
import type { AccountStage } from "../accounts/stage";
import { defaultPlaybook, type PlaybookId, type Recommendation } from "./definitions";

type Sb = any;

export interface OutreachContext {
  company: { id: string; company_name: string; industry: string | null };
  stage: AccountStage;
  firstTouch: boolean;
  hasApprovedProposal: boolean;
  recommendation: Recommendation;
}

const APPROVED_OR_BEYOND = ["approved", "scheduled", "sent"];
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** True when an email to this company has already been sent (by its own company link or through a proposal). */
export async function hasPriorOutbound(sb: Sb, tenantId: string, companyId: string): Promise<boolean> {
  const direct = await sb.from("emails").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("company_id", companyId).not("sent_at", "is", null);
  if (!direct.error && (direct.count ?? 0) > 0) return true;

  const { data: props } = await sb.from("proposals").select("id").eq("tenant_id", tenantId).eq("company_id", companyId);
  for (const part of chunks(((props ?? []) as Array<{ id: string }>).map((p) => p.id))) {
    const r = await sb.from("emails").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("proposal_id", part).not("sent_at", "is", null);
    if (!r.error && (r.count ?? 0) > 0) return true;
  }
  return false;
}

export async function loadOutreachContext(sb: Sb, tenantId: string, companyId: string): Promise<OutreachContext | null> {
  const { data: company } = await sb.from("companies").select("id, company_name, industry").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return null;

  const stageRes = await loadStage(sb, tenantId, companyId);
  const stage: AccountStage = stageRes.ok ? stageRes.value.stage : "directory";
  const firstTouch = !(await hasPriorOutbound(sb, tenantId, companyId));
  const { count } = await sb.from("proposals").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("company_id", companyId).in("status", APPROVED_OR_BEYOND);
  const hasApprovedProposal = (count ?? 0) > 0;

  return { company, stage, firstTouch, hasApprovedProposal, recommendation: defaultPlaybook({ stage, firstTouch, hasApprovedProposal }) };
}

/** Records the playbook on an email that already exists. Best effort: before migration 0061 it does nothing. */
export async function stampEmail(sb: Sb, tenantId: string, emailId: string, fields: { companyId: string; playbook: PlaybookId; note?: string | null }): Promise<void> {
  try {
    const { error } = await sb
      .from("emails")
      .update({ company_id: fields.companyId, playbook: fields.playbook, playbook_note: fields.note ?? null })
      .eq("id", emailId)
      .eq("tenant_id", tenantId);
    if (error && !isMissingMigration(error)) console.error("[playbooks] stamping email failed", error.message);
  } catch {
    /* the email is saved; the stamp is a record */
  }
}

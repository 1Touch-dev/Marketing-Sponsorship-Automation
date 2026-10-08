import { checkRecipient, stampSigner } from "@/lib/contacts/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { invokeClaude } from "@/lib/bedrock/client";
import { PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { resolveDefaultSender } from "@/lib/email/template-engine";
import { emailOutputSchema, validateAiOutput, type EmailOutput } from "@/lib/ai/schemas";
import { loadVerifiedClaimsBlock } from "@/lib/claims/sponsor-claims";
import { listBriefs } from "@/lib/briefs/store";
import { briefPromptBlock, evaluateGate } from "@/lib/briefs/model";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { loadOutreachContext } from "@/lib/playbooks/store";
import { checkPlaybook, RELATIONSHIP_PLAYBOOKS } from "@/lib/playbooks/definitions";
import { relationshipEmailPrompt } from "@/lib/playbooks/prompt";
import { relationshipEmailViolations } from "@/lib/playbooks/guard";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import { userActor } from "@/lib/identity/actor";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  playbook: z.enum(RELATIONSHIP_PLAYBOOKS as unknown as [string, ...string[]]),
  recipient: z.string().email().max(200),
  recipient_name: z.string().max(200).nullish(),
  recipient_title: z.string().max(200).nullish(),
  detail: z.string().max(1500).nullish(),
});

/**
 * Drafts a relationship-first email (a conversation, an invitation or an
 * introduction) for a company. It needs no proposal and carries no link and no
 * price: the model's output is checked for both and refused if it slips. The
 * draft goes to the approval queue like any other email; nothing is sent here.
 */
async function postHandler(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const rl = checkRateLimit(`outreach-email:${getClientIp(req)}`, { max: 15, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;
  const playbook = body.playbook as (typeof RELATIONSHIP_PLAYBOOKS)[number] & ("conversation" | "invitation" | "introduction");

  const sb = supabaseAdmin();

  // Before migration 0061 the email cannot be saved, so stop now rather than spend an AI call on a draft that has nowhere to go.
  const probe = await sb.from("emails").select("company_id, playbook").limit(1);
  if (probe.error && isMissingMigration(probe.error)) {
    return NextResponse.json({ error: "Outreach playbooks are not set up yet (migration 0061)." }, { status: 503 });
  }

  const c = await loadOutreachContext(sb, auth.user.tenant_id, ctx.params.id);
  if (!c) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Do-not-contact and dead addresses are refused before any AI call.
  const standing = await checkRecipient(sb, auth.user.tenant_id, { email: body.recipient, companyId: c.company.id });
  if (!standing.allowed) return NextResponse.json({ error: standing.blocks[0].message, code: "recipient_blocked", blocks: standing.blocks }, { status: 409 });

  const check = checkPlaybook({ playbook, stage: c.stage, firstTouch: c.firstTouch, hasApprovedProposal: c.hasApprovedProposal, detail: body.detail, actor: { kind: "human", email: auth.user.email } });
  if (!check.allowed) return NextResponse.json({ error: check.reason, code: "playbook_not_allowed" }, { status: 400 });

  const tenant = await resolveClubContext(auth.user.tenant_id);
  const { senderName, senderTitle, memberId: signerId } = await resolveDefaultSender(sb, auth.user.tenant_id);
  const briefs = await listBriefs(sb, auth.user.tenant_id, c.company.id);
  const latest = briefs.ok ? briefs.value[0] : null;
  const prompt = relationshipEmailPrompt({
    playbook,
    companyName: c.company.company_name,
    industry: c.company.industry,
    contactName: body.recipient_name,
    contactTitle: body.recipient_title,
    senderName,
    senderTitle,
    detail: body.detail,
    verifiedClaims: await loadVerifiedClaimsBlock(sb, auth.user.tenant_id),
    buyerBrief: latest && evaluateGate(latest).ok ? briefPromptBlock(latest) : undefined,
    tenant,
  });

  let output: EmailOutput | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= 2 && !output; attempt++) {
    try {
      const claude = await invokeClaude<unknown>({ system: prompt.system, messages: [{ role: "user", content: prompt.user }], json: true, maxTokens: 700, temperature: 0.5 });
      const vr = validateAiOutput(emailOutputSchema, claude.json, { workflow_name: "email.generate_relationship", entity_id: c.company.id });
      if (!vr.ok || !vr.data) { lastError = vr.error ?? "Validation failed"; continue; }
      const violations = relationshipEmailViolations(`${vr.data.subject}\n${vr.data.body_text}\n${vr.data.body_html ?? ""}`);
      if (violations.length > 0) { lastError = `the draft ${violations.map((v) => v.rule).join(", ")}`; continue; }
      output = vr.data;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
    }
  }
  if (!output) return NextResponse.json({ error: `Could not draft a clean relationship email: ${lastError}` }, { status: 502 });

  const env = serverEnv();
  const { data: row, error } = await sb
    .from("emails")
    .insert({
      tenant_id: auth.user.tenant_id,
      company_id: c.company.id,
      proposal_id: null,
      recipient: body.recipient,
      subject: output.subject,
      body_text: output.body_text,
      body_html: output.body_html ?? `<p>${output.body_text.replace(/\n/g, "</p><p>")}</p>`,
      status: "pending_approval",
      generated_by: "bedrock-claude",
      sender: env.DEFAULT_FROM_EMAIL ?? null,
      prompt_version: PROMPT_VERSION,
      flow_type: "relationship",
      playbook,
      metadata: { playbook, detail: body.detail ?? null, recipient_name: body.recipient_name ?? null, first_touch: c.firstTouch, account_stage: c.stage, model_id: env.BEDROCK_MODEL_ID },
    } as never)
    .select("id, subject, body_text")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: isMissingMigration(error) ? "Outreach playbooks are not set up yet (migration 0061)." : error?.message ?? "Insert failed" }, { status: isMissingMigration(error) ? 503 : 500 });
  }

  await stampSigner(sb, auth.user.tenant_id, row.id, signerId);
  await recordAudit({ actor: userActor(auth.user), entity_type: "email", entity_id: row.id, action: "email.relationship_drafted", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { company_id: c.company.id, playbook, first_touch: c.firstTouch, actor_user_id: auth.user.id } });
  return NextResponse.json({ email_id: row.id, playbook, subject: row.subject, preview: row.body_text.slice(0, 200), recommended: c.recommendation }, { status: 201 });
}

export const POST = idempotent("outreach-email.generate", postHandler);

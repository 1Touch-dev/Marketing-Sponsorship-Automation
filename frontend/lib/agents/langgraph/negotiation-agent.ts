/**
 * Negotiation Agent — Phase 8, Team 1's 5th agent (`master_report.md`
 * Section 7.2), the one role from the original 5-agent Outreach team that
 * was never built. Extends Phase 2's reply classification (which could
 * already tell you a reply was an "objection", but did nothing about it)
 * with a real drafted counter-response.
 *
 * Built as a LangGraph.js StateGraph per the Phase 8 framework decision
 * (PLATFORM_ROADMAP.md — MIT licensed, first-party TypeScript, no new
 * infra) rather than a hand-rolled function, so it composes the same way
 * future Team 2 agents will. Deliberately does NOT touch the existing
 * (already-proven, production-critical) Discovery/Enrichment/Proposal
 * orchestrator in lib/agents/orchestrator.ts — that's a separate,
 * lower-risk migration left for later rather than rushed alongside new
 * work.
 *
 * Output is a normal DRAFT email row (status: "pending_approval") —
 * it flows through the exact same hardened approval gate as every other
 * outbound email (see app/api/emails/[id]/send/route.ts, fixed earlier
 * today), never sent automatically.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { validateAiOutput, emailOutputSchema } from "@/lib/ai/schemas";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { guardColumns } from "@/lib/db/column-guard";
import { serverEnv } from "@/lib/env";

const NegotiationState = Annotation.Root({
  emailId: Annotation<string>,
  tenantId: Annotation<string>,
  proposalId: Annotation<string | null>,
  companyName: Annotation<string>,
  recipientEmail: Annotation<string>,
  replyText: Annotation<string>,
  replyClassification: Annotation<string | null>,
  replySummary: Annotation<string | null>,
  proposalTitle: Annotation<string>,
  proposalContent: Annotation<Record<string, unknown> | null>,
  packages: Annotation<Array<{ name: string; price_brl: number | null; benefits: unknown }>>,
  clubName: Annotation<string>,
  draftSubject: Annotation<string | null>,
  draftBodyText: Annotation<string | null>,
  error: Annotation<string | null>,
});

async function gatherContext(state: typeof NegotiationState.State): Promise<Partial<typeof NegotiationState.State>> {
  const sb = supabaseAdmin();

  const { data: email } = await sb
    .from("emails")
    .select("id, tenant_id, proposal_id, recipient, body_text, reply_classification, reply_summary, companies:proposal_id(companies(company_name))")
    .eq("id", state.emailId)
    .maybeSingle();

  if (!email) return { error: "Email not found" };

  const tenantId = (email as { tenant_id: string }).tenant_id;
  const proposalId = (email as { proposal_id: string | null }).proposal_id;

  let proposalTitle = "";
  let proposalContent: Record<string, unknown> | null = null;
  let companyName = "";
  let packages: Array<{ name: string; price_brl: number | null; benefits: unknown }> = [];

  if (proposalId) {
    const { data: proposal } = await sb
      .from("proposals")
      .select("title, content, companies(company_name)")
      .eq("id", proposalId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (proposal) {
      proposalTitle = proposal.title;
      proposalContent = proposal.content as Record<string, unknown>;
      companyName = (proposal as unknown as { companies: { company_name: string } | null }).companies?.company_name ?? "";
    }

    const { data: packageRows } = await sb
      .from("proposal_packages")
      .select("name, price_brl, benefits")
      .eq("proposal_id", proposalId)
      .eq("active", true);
    packages = packageRows ?? [];
  }

  const clubContext = await resolveClubContext(tenantId);

  return {
    tenantId,
    proposalId,
    companyName,
    recipientEmail: (email as { recipient: string }).recipient,
    replyText: (email as { body_text: string | null }).body_text ?? "",
    replyClassification: (email as { reply_classification: string | null }).reply_classification,
    replySummary: (email as { reply_summary: string | null }).reply_summary,
    proposalTitle,
    proposalContent,
    packages,
    clubName: clubContext.club_facts.short_name ?? clubContext.club_facts.club_name,
  };
}

async function draftCounter(state: typeof NegotiationState.State): Promise<Partial<typeof NegotiationState.State>> {
  if (state.error) return {};

  const packagesBlock = state.packages.length
    ? state.packages
        .map((p) => `- ${p.name}: R$ ${p.price_brl?.toLocaleString("pt-BR") ?? "sob consulta"}`)
        .join("\n")
    : null;

  const content = state.proposalContent as { deliverables?: string[]; investment_note?: string } | null;
  const deliverablesBlock = content?.deliverables?.length ? content.deliverables.map((d) => `- ${d}`).join("\n") : null;

  const system = `Você é um Agente de Negociação de patrocínios do ${state.clubName}. Sua tarefa é redigir uma resposta a uma objeção ou pedido de mais informações de um patrocinador em potencial, sobre a proposta "${state.proposalTitle}" para ${state.companyName || "o patrocinador"}.

REGRAS DE GROUNDING (crítico — nunca invente):
- Só cite preços/pacotes que aparecem EXATAMENTE na lista de pacotes reais abaixo. Se não houver pacotes cadastrados, NÃO invente valores — mantenha a resposta qualitativa sobre valor/flexibilidade, sem números específicos.
- Só cite deliverables/benefícios que aparecem na lista real abaixo.
- Nunca prometa descontos, prazos ou condições que não foram explicitamente autorizados pelo usuário.
- Tom: profissional, colaborativo, focado em resolver a objeção específica do patrocinador — não um discurso de vendas genérico.
- Responda em português brasileiro.

Retorne JSON estrito: {"subject": "...", "body_text": "..."}`;

  const user = `Classificação da resposta do patrocinador: ${state.replyClassification ?? "não classificada"}
Resumo da resposta: ${state.replySummary ?? "N/A"}

Texto completo da resposta do patrocinador:
"""
${state.replyText || "(sem texto de resposta disponível)"}
"""

Pacotes/preços REAIS desta proposta (só cite estes, nunca invente outros):
${packagesBlock ?? "Nenhum pacote com preço cadastrado — mantenha a resposta sem números específicos."}

Deliverables REAIS desta proposta:
${deliverablesBlock ?? "Nenhum deliverable específico cadastrado."}

Redija uma resposta de negociação que aborde diretamente a objeção/dúvida do patrocinador, grounded apenas nos dados reais acima.`;

  const result = await invokeClaude<{ subject: string; body_text: string }>({
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 1000,
    temperature: 0.4,
    entityType: "proposal",
    entityId: state.proposalId,
  });

  const validated = validateAiOutput(emailOutputSchema, result.json, {
    workflow: "negotiation_agent.draft_counter",
    entity_id: state.proposalId ?? state.emailId,
  });

  if (!validated.ok || !validated.data) {
    return { error: "Negotiation draft generation failed validation" };
  }

  return { draftSubject: validated.data.subject, draftBodyText: validated.data.body_text };
}

const graph = new StateGraph(NegotiationState)
  .addNode("gather_context", gatherContext)
  .addNode("draft_counter", draftCounter)
  .addEdge(START, "gather_context")
  .addEdge("gather_context", "draft_counter")
  .addEdge("draft_counter", END)
  .compile();

export interface NegotiationAgentResult {
  success: boolean;
  draftEmailId?: string;
  subject?: string;
  error?: string;
}

/**
 * Runs the negotiation graph for a given inbound (reply) email and, on
 * success, creates a new outbound draft email (status: pending_approval)
 * linked to the same proposal — ready for a human to review/edit/approve
 * through the existing email approval flow.
 */
export async function runNegotiationAgent(emailId: string): Promise<NegotiationAgentResult> {
  const finalState = await graph.invoke({ emailId } as typeof NegotiationState.State);

  if (finalState.error || !finalState.draftSubject || !finalState.draftBodyText) {
    return { success: false, error: finalState.error ?? "Unknown negotiation agent failure" };
  }

  const sb = supabaseAdmin();
  const env = serverEnv();
  const { data: draftRow, error: insertError } = await sb
    .from("emails")
    .insert(
      guardColumns("emails", {
        tenant_id: finalState.tenantId,
        proposal_id: finalState.proposalId,
        recipient: finalState.recipientEmail,
        subject: finalState.draftSubject,
        body_text: finalState.draftBodyText,
        body_html: `<p>${finalState.draftBodyText.replace(/\n/g, "</p><p>")}</p>`,
        status: "pending_approval",
        generated_by: "negotiation-agent-langgraph",
        sender: env.DEFAULT_FROM_EMAIL ?? null,
        metadata: {
          agent_generated: true,
          negotiation_agent: true,
          in_reply_to_email_id: emailId,
          reply_classification: finalState.replyClassification,
        },
      }),
    )
    .select("id")
    .single();

  if (insertError || !draftRow) {
    return { success: false, error: insertError?.message ?? "Failed to save negotiation draft" };
  }

  return { success: true, draftEmailId: draftRow.id, subject: finalState.draftSubject };
}

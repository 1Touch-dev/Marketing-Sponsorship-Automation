import crypto from "crypto";
import type { ProposalContent } from "@/types/database";

type FulfillmentTask = NonNullable<ProposalContent["fulfillment_tasks"]>[number];

const STANDARD_TASKS = [
  "Enviar contrato assinado e nota fiscal ao patrocinador",
  "Agendar reunião de kickoff com o time do patrocinador",
  "Confirmar dados de faturamento e cronograma de pagamento",
  "Compartilhar calendário de ativações da temporada",
];

/**
 * Task 10 — auto-generates a fulfillment checklist the moment a contract
 * is signed (POST /api/contracts), so operational follow-through doesn't
 * depend on someone remembering to create tasks manually. One item per
 * contracted deliverable (the same list already shown to the sponsor on
 * the public proposal) plus a handful of standard onboarding steps.
 */
export function generateFulfillmentTasks(deliverables: string[]): FulfillmentTask[] {
  const now = new Date().toISOString();
  const titles = [...STANDARD_TASKS, ...deliverables.map((d) => `Entregar: ${d}`)];
  return titles.map((title) => ({
    id: crypto.randomUUID(),
    title,
    status: "pending" as const,
    created_at: now,
    completed_at: null,
  }));
}

import { invokeClaude } from "@/lib/bedrock/client";
import { logger } from "@/lib/monitoring/logger";

/**
 * Phase 2 hardening (master_report.md Section 7.2 — Negotiation Agent role
 * description, "improve the text/email agents" per James's confirmed
 * sequencing). Classifies an inbound reply so a human can triage a queue
 * instead of opening every thread cold.
 */
export type ReplyClassification =
  | "interested"
  | "objection"
  | "not_interested"
  | "needs_info"
  | "out_of_office"
  | "other";

const VALID_CLASSIFICATIONS: ReplyClassification[] = [
  "interested",
  "objection",
  "not_interested",
  "needs_info",
  "out_of_office",
  "other",
];

export interface ReplyClassificationResult {
  classification: ReplyClassification;
  confidence: number;
  summary: string;
}

const SYSTEM_PROMPT = `You classify inbound email replies to a sponsorship-outreach email from a Brazilian football club (Coritiba FC) to a prospective corporate sponsor. Read the reply and return STRICT JSON only, no prose, matching exactly this shape:
{"classification": "interested" | "objection" | "not_interested" | "needs_info" | "out_of_office" | "other", "confidence": <number 0.0-1.0>, "summary": "<one sentence, max 20 words, written in the same language as the reply>"}

Definitions:
- interested: wants to move forward, asks for a call/meeting, positive tone
- objection: raises a specific concern (price, timing, fit) but hasn't said no
- not_interested: explicitly declines or says no
- needs_info: asks a clarifying question before deciding
- out_of_office: automated/away message, not a real reply from the person
- other: doesn't fit any of the above (forwarded to someone else, unrelated, unclear)

Return ONLY the JSON object, nothing else — no markdown fences, no explanation.`;

/**
 * Classifies a single inbound reply. Never throws — a classification
 * failure (spend cap reached, malformed model output, network error) must
 * not block the reply-sync pipeline that calls this. Falls back to
 * classification "other" with confidence 0, which is visually
 * distinguishable in the UI from a genuine low-confidence "other" call.
 */
export async function classifyReply(args: {
  subject: string;
  bodyText: string;
}): Promise<ReplyClassificationResult> {
  try {
    const result = await invokeClaude<{
      classification?: string;
      confidence?: number;
      summary?: string;
    }>({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Subject: ${args.subject}\n\nBody:\n${args.bodyText.slice(0, 4000)}`,
        },
      ],
      json: true,
      maxTokens: 300,
      temperature: 0.1,
    });

    const parsed = result.json;
    const classification =
      parsed && VALID_CLASSIFICATIONS.includes(parsed.classification as ReplyClassification)
        ? (parsed.classification as ReplyClassification)
        : "other";
    const confidence =
      parsed && typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;
    const summary =
      parsed && typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 300)
        : "Could not summarize.";

    return { classification, confidence, summary };
  } catch (err) {
    logger.warn("[reply-classifier] classification failed, falling back to 'other'", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { classification: "other", confidence: 0, summary: "Classification failed." };
  }
}

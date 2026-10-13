import { logCrmActivity, type PushContext } from "./adapter";

/**
 * Logs an email as an activity on the proposal's Pipedrive deal, found by its stored link.
 *
 * What this records is that Coxa put a note in the CRM. It is labelled that way in Pipedrive, and the result is "logged in
 * CRM": it does not say the email was delivered. Whether an email was delivered is a separate state (the delivery state
 * machine). With no deal linked to the proposal there is nothing to attach it to, and the answer says so (it is not matched
 * to a deal by title, and it is not posted loose).
 *
 * Returns the Pipedrive activity ID on success, as it always did.
 */
export async function logEmailToPipedrive(
  ctx: PushContext,
  proposalId: string | null | undefined,
  email: { subject: string; bodyHtml: string },
): Promise<{ activity_id: number | null; error?: string }> {
  if (!proposalId) return { activity_id: null, error: "This email is not attached to a proposal, so there is no Pipedrive deal to log it on." };
  const r = await logCrmActivity(ctx, proposalId, { subject: email.subject, note: email.bodyHtml, type: "email" });
  if (r.ok) return { activity_id: r.external_id && /^\d+$/.test(r.external_id) ? Number(r.external_id) : null };
  if (r.skipped === "no_deal") return { activity_id: null, error: "This proposal has no deal in Pipedrive yet, so the email was not logged there." };
  return { activity_id: null, error: r.error ?? "Not logged in Pipedrive." };
}

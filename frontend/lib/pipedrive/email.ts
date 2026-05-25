/**
 * Log an email as a Pipedrive Activity (type: "email")
 * Returns the Pipedrive activity ID on success.
 */
export interface PipedriveEmailOptions {
  subject: string;
  bodyHtml: string;
  recipientName?: string;
  pipedrive_deal_id?: number | null;
  pipedrive_org_id?: number | null;
  pipedrive_person_id?: number | null;
  doneDate?: string; // YYYY-MM-DD, defaults to today
}

export async function logEmailToPipedrive(opts: PipedriveEmailOptions): Promise<{ activity_id: number | null; error?: string }> {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) return { activity_id: null, error: "PIPEDRIVE_API_KEY not set" };

  const today = new Date().toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    subject: opts.subject,
    type: "email",
    due_date: opts.doneDate ?? today,
    done: 1,
    note: opts.bodyHtml,
  };
  if (opts.pipedrive_deal_id) body.deal_id = opts.pipedrive_deal_id;
  if (opts.pipedrive_org_id) body.org_id = opts.pipedrive_org_id;
  if (opts.pipedrive_person_id) body.person_id = opts.pipedrive_person_id;

  try {
    const res = await fetch(`https://api.pipedrive.com/v1/activities?api_token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { activity_id: null, error: json.error ?? `Pipedrive error: ${res.status}` };
    }
    return { activity_id: json.data?.id ?? null };
  } catch (err) {
    return { activity_id: null, error: err instanceof Error ? err.message : "unknown" };
  }
}

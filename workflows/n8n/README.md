# n8n workflows (Phase 1)

These JSON files are **starting points** for import into [n8n](https://docs.n8n.io/workflows/export-import/). Node versions may differ slightly by n8n release—after import, open each workflow and confirm node compatibility.

## Prerequisites

1. Deploy or run the **Next.js** app and set the base URL in n8n environment variables.
2. In n8n: **Settings → Variables** (or container env), set:
   - `MSA_APP_URL` — e.g. `https://your-ec2-or-app-url` (no trailing slash)

Optional (recommended for workflow `07` in production):

3. Set `MSA_INTERNAL_WEBHOOK_SECRET` in the Next.js app (see `.env.example`).  
   If set, the HTTP node in workflow **07** must send header `x-msa-webhook-secret` with the same value (add **Headers** on the HTTP Request node).

## AI + data flow

Orchestration uses **n8n**; **Amazon Bedrock (Claude)** and **Supabase** are invoked from **Next.js API routes** (`frontend/app/api/**`). This avoids duplicating Bedrock signing logic inside n8n and keeps one implementation path.

## Webhook payloads

| Workflow | Endpoint (after import) | Body (JSON) |
|----------|-------------------------|-------------|
| 01 | `/webhook/msa-campaign-generate` | `{ "company_id": "uuid", "objective": "...", "max_ideas": 5 }` |
| 02 | `/webhook/msa-proposal-generate` | `{ "campaign_id": "uuid" }` |
| 03 | `/webhook/msa-approval` | `{ "proposal_id": "uuid", "decision": "approve" \| "reject" \| "request_revision", "comments": "..." }` |
| 04 | `/webhook/msa-gmail-draft` | `{ "generate": { "proposal_id": "uuid", "recipient": "a@b.com", "contact_name": "..." }, "mode": "draft" \| "send" }` |
| 05 | Manual test | Calls `POST /api/gmail/sync-threads` — replace Manual Trigger with **Schedule** in production. |
| 06 | `/webhook/msa-followup` | `{ "email_id": "uuid" }` |
| 07 | `/webhook/msa-audit` | `{ "entity_type": "workflow", "action": "n8n.step", "entity_id": null, "metadata": { } }` |

## Retries

In n8n, open the **HTTP Request** nodes → **Settings** → enable retries / set `On Error` to match your operations policy.

## Files

- `01-campaign-idea-generation.json`
- `02-proposal-generation.json`
- `03-approval-flow.json`
- `04-gmail-draft-creation.json`
- `05-gmail-reply-tracking.json`
- `06-follow-up-suggestions.json`
- `07-audit-logging.json`

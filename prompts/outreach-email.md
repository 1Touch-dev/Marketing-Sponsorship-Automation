# Outreach email (Bedrock)

See `frontend/lib/bedrock/prompts.ts` → `outreachEmailPrompt`.

Expected JSON:

```json
{
  "subject": "short subject line",
  "body_text": "plain text body",
  "body_html": "same body, simple HTML (<p>...</p>)"
}
```

Emails are stored with `status: pending_approval` until reviewed; Gmail send is only via `/api/emails/:id/send`.

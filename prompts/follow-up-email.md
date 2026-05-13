# Follow-up email (Bedrock)

See `frontend/lib/bedrock/prompts.ts` → `followupEmailPrompt`.

Expected JSON:

```json
{
  "subject": "follow-up subject (reuse or prefix with Re:)",
  "body_text": "plain text body",
  "body_html": "<p>...</p> body"
}
```

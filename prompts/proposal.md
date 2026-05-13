# Proposal generation (Bedrock)

See `frontend/lib/bedrock/prompts.ts` → `proposalPrompt`.

Expected JSON:

```json
{
  "title": "Proposal title",
  "executive_summary": "string (~120 words)",
  "campaign_rationale": "string (~150 words)",
  "sponsorship_value": "string describing the value to the sponsor",
  "activation_plan": "string with concrete steps",
  "deliverables": ["string", "string", "string"],
  "investment_note": "string (high-level, no specific currency)",
  "cta": "single-sentence call to action"
}
```

Markdown rendering for editors is built in `frontend/app/api/proposals/generate/route.ts` (`renderMarkdown`).

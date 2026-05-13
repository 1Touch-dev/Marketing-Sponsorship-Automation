# Campaign ideas (Bedrock)

System and user prompts are implemented in `frontend/lib/bedrock/prompts.ts` → `campaignIdeasPrompt`.

The model must return JSON:

```json
{
  "ideas": [
    {
      "title": "string",
      "summary": "1-2 sentence concept",
      "activation": "concrete activation plan",
      "partnership_angle": "why this partnership makes sense",
      "cta": "call to action for outreach"
    }
  ]
}
```

Do not change the JSON shape without updating `frontend/app/api/campaigns/generate/route.ts`.

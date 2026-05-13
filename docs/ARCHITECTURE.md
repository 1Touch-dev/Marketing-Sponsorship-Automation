# Market Sponsorship Automation — Architecture

## High-level

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js 14 │────▶│  API routes  │────▶│ Supabase (PG)  │
│  App Router │     │  (Node.js)   │     │ + Storage       │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                  ┌────────▼────────┐
                  │ AWS Bedrock     │
                  │ (Claude Sonnet)  │
                  └─────────────────┘
                           │
                  ┌────────▼────────┐
                  │ Gmail API       │
                  │ (OAuth tokens   │
                  │  in public.     │
                  │  users row)     │
                  └─────────────────┘

┌─────────────┐     HTTP webhooks / schedule
│    n8n      │──────────────────────────────────▶ Next.js `/api/*`
└─────────────┘
```

- **Source of truth:** Supabase Postgres + storage buckets (`proposals`, `campaign-assets`, `audit-files`).
- **Human approval:** Proposals and outbound emails require explicit status transitions before Gmail send (see API route guards).
- **n8n:** Optional orchestration; business logic for AI + persistence lives in Next.js for a single codepath.

## Frontend (`frontend/`)

- Next.js 14 App Router, TypeScript strict, Tailwind, shadcn-style UI primitives under `components/ui`.
- Server components fetch via **service role** (`supabaseAdmin()`) for the MVP operator dashboard (no end-user auth UI in Phase 1).
- Client components call REST API routes under `/api/*`.

## Backend surface

There is no separate Node server: **Route Handlers** in `frontend/app/api/**` are the backend.

Optional folder **`backend/`** in repo documents integration boundaries only.

## Security notes

- Never commit `.env`. Use `.env.example` as a template.
- `SUPABASE_SERVICE_ROLE_KEY` and AWS keys must only run on the server.
- Set `MSA_INTERNAL_WEBHOOK_SECRET` if you expose `/api/workflows/audit` to n8n over the internet.

## Official references

- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Amazon Bedrock Anthropic Messages](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html)
- [Gmail API](https://developers.google.com/gmail/api/guides)

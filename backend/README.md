# Backend

Phase 1 backend logic is implemented as **Next.js Route Handlers**:

`frontend/app/api/**`

There is no separate long-running API server. n8n and other callers invoke these HTTPS endpoints.

| Area | Routes |
|------|--------|
| Companies | `POST /api/companies` |
| Campaigns | `POST /api/campaigns/generate` |
| Proposals | `POST /api/proposals/generate`, `PATCH /api/proposals/:id`, `POST /api/proposals/:id/approve` |
| Emails | `POST /api/emails/generate`, `POST /api/emails/:id/send` |
| Follow-ups | `POST /api/followups/generate` |
| Gmail | `GET /api/auth/gmail`, `GET /api/auth/gmail/callback`, `POST /api/gmail/sync-threads` |
| Workflows | `POST /api/workflows/audit` |

All server-only secrets are read via `serverEnv()` in `frontend/lib/env.ts`.

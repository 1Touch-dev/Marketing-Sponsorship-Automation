# Coritiba FC Platform — Sprint Report (27 May 2026)
**Updated:** 27 May 2026 | **By:** Abhishek  
**Branch:** `feature/apify-commercial-intelligence`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br`

---

## Today's Completed Work (27 May)

### ✅ D1 — Pipedrive Live Integration — UNBLOCKED & LIVE

James provided the new API token (`c07f34a697f7551fe9c54cda9653903dc0155cf2`).

**What was done:**
- Token updated in `frontend/.env.local` and root `.env`
- PM2 restarted with `--update-env`
- Health check verified: `pipedrive: { configured: true, healthy: true }`

**Live test results — all passing:**

| Test | Result |
|------|--------|
| Token validation (`/users/me`) | ✓ Admin user, Company: Coritiba, Currency: BRL |
| Pipelines fetch | ✓ All 5 pipelines found: Couto Pereira, Mídias, Patrocínios, Licenciamento, Lei Incentivo |
| Stage IDs (Patrocínios) | ✓ All 5 stages correct: 18 Contatar Lead, 19 Diagnóstico, 21 Elaborar Proposta, 20 Negociação, 24 Contrato |
| Org search (Sicredi) | ✓ Found existing org in Pipedrive |
| Company sync (create org) | ✓ Volt Energia Paraná → Pipedrive org ID 380 |
| Proposal sync (create deal) | ✓ Red Bull Brasil × Coritiba FC → Deal ID 976, Pipeline 3 (Patrocínios) |
| Status change (approved) | ✓ Deal 976 stage updated correctly |
| CRM queue | ✓ 35 synced jobs logged |

**What Pipedrive integration does (live now):**
- New company → creates Pipedrive **Organization**
- New/updated proposal → creates **Deal** in correct pipeline
- Proposal type determines pipeline: Patrocínios (3), Lei Incentivo (5), Mídias (2), Licenciamento (4)
- Status changes → auto-updates deal stage (`draft/review` → Elaborar Proposta, `approved` → Negociação, `rejected` → Lost)
- Active contract → deal marked as Won
- All actions logged in `crm_sync_queue` table with audit trail
- Retry failed jobs via `/api/crm` PATCH endpoint

---

## Previous Sprint (26 May) — All Confirmed Live

| Feature | Status |
|---------|--------|
| Proposal revision loop (draft→review→revision→edit→resubmit→approve) | ✅ Live |
| Bulk industry campaigns (up to 20, parallel, ~5 min for 15) | ✅ Live |
| Proposal A/B/C strategy variants + pricing tiers | ✅ Live |
| Monthly sponsor reports (`/reports` page) | ✅ Live |
| Upcoming matches on public landing page | ✅ Live |
| Replicate API token live + health check | ✅ Live |
| Jersey LoRA training zip ready (18 images) | ✅ Ready |
| Auth hardening (login/logout/middleware) | ✅ Live |
| Bulk API parallelised (3× faster) | ✅ Live |

---

## Full Platform — Currently Live Features

| Category | Feature |
|----------|---------|
| **Auth** | Supabase Auth login/logout, middleware, protected routes |
| **Companies** | CRUD, intelligence (Apify), competitor discovery |
| **Campaigns** | AI generation, single + bulk (up to 20/batch) |
| **Proposals** | Full wizard, edit, revision loop, approval flow, A/B/C variants, pricing tiers |
| **CRM** | **Pipedrive live sync** — orgs, deals, stage updates, audit trail |
| **Reports** | Monthly AI reports for active sponsors |
| **Inventory** | Digital + physical fields, execution briefs |
| **Mockups** | Konva editor, Coritiba jersey template |
| **Landing page** | Public share links, KPIs, upcoming matches section |
| **Media** | Image generation, modal |
| **Barter** | Barter workflow |
| **Lei de Incentivo** | Dedicated pipeline |
| **Health** | `/api/system/health` — DB, Bedrock, Pipedrive, Replicate all healthy |

---

## Current Blockers

| # | Blocker | Owner | Status |
|---|---------|-------|--------|
| 1 | **Pipedrive API token** | James | ✅ RESOLVED (27 May) |
| 2 | **Replicate LoRA training** | Abhishek | Token live; jersey zip ready; need to upload & train |
| 3 | **Dropbox jersey video** | James | Link restricted; PDF images extracted instead (18 imgs) |
| 4 | **Intern E2E testing** | Interns | Not started — required before James demo |

---

## Pending Tasks (no blockers)

| # | Task | Est. | Priority |
|---|------|------|----------|
| C3 | **Train FLUX LoRA on Replicate** | 30 min, ~$2 | HIGH — next dev task |
| C4 | **Wire Replicate image generation** into mockup flow | 1 day | HIGH |
| B6 | **Asana integration** — tasks from execution brief | 1 day | Medium |
| B7 | **News/articles** on public landing page | 3–4h | Low |
| — | **Intern test round** (17-point checklist) | Half day | REQUIRED gate |
| — | **Regression after Pipedrive** | 2h | Recommended |

---

## Intern Test Checklist (updated — 17 tests)

**No demo to James until all pass.**

| # | Test | Pass |
|---|------|------|
| T1 | Login `patrocinios@coritiba.com.br` | [ ] |
| T2 | Protected routes redirect to `/login` | [ ] |
| T3 | Company → Run Intelligence → Competitors | [ ] |
| T4 | Campaign → AI generate | [ ] |
| T5 | Proposal wizard full flow | [ ] |
| T6 | Logo / brand asset upload | [ ] |
| T7 | Image generation + modal | [ ] |
| T8 | Submit → Approve → Active/In Contract | [ ] |
| T9 | Revision loop (approve → revise → re-submit → approve) | [ ] |
| T10 | Public share link in incognito | [ ] |
| T11 | Inventory: digital + physical fields | [ ] |
| T12 | Mockup editor: templates + export | [ ] |
| T13 | Barter workflow | [ ] |
| T14 | Bulk campaigns: Automotivo → 10 companies | [ ] |
| T15 | Monthly report: active contract → generate → download | [ ] |
| T16 | Landing page: Próximas Partidas visible | [ ] |
| T17 | **CRM Sync page**: green banner "Pipedrive Conectado" | [ ] |

---

## Health Check — Current State

```json
{
  "status": "healthy",
  "services": {
    "database": { "healthy": true, "latency_ms": ~280 },
    "bedrock_ai": { "configured": true },
    "pipedrive": { "configured": true, "healthy": true },
    "replicate": { "configured": true, "healthy": true }
  },
  "platform": {
    "companies": 513,
    "proposals_total": 60,
    "proposals_active": 59,
    "campaigns": 74
  }
}
```

---

## Suggested Next Steps (3-day plan)

| Day | Task |
|-----|------|
| **Today (27 May)** | ✅ Pipedrive live. Next: Upload jersey zip → train FLUX LoRA on Replicate (~20 min, ~$2) |
| **28 May** | Wire Replicate generation into mockup flow; Asana integration |
| **29 May** | Intern testing round. Fix bugs. Final regression. Loom for James. |

---

## API Keys Status (27 May)

| Key | Status |
|-----|--------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅ Live (Bedrock) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ Live |
| `REPLICATE_API_TOKEN` | ✅ Live (model not trained yet) |
| `PIPEDRIVE_API_KEY` | ✅ Live — verified 27 May |
| `OPENAI_API_KEY` | ✅ Live |
| `APIFY_API_TOKEN` | ✅ Live |
| `SERPAPI_KEY` | ✅ Live |
| Hunter.io | ⏳ Not obtained (Ruhani, low priority) |
| ZeroBounce | ⏳ Not obtained (Ruhani, low priority) |
| Placid | ⏳ Not obtained (Ruhani, low priority) |

---

## Pipedrive Integration — Technical Reference

```
Company create/update  → POST /api/crm { entity_type: "company", operation: "create" }
Proposal create        → POST /api/crm { entity_type: "proposal", operation: "create" }
Status change          → POST /api/crm { entity_type: "proposal", operation: "status_change", payload: { new_status, pipedrive_deal_id } }
Queue status           → GET  /api/crm?status=synced|pending|failed
Retry failed           → PATCH /api/crm { action: "retry_failed" }
Flush pending          → PATCH /api/crm { action: "flush_pending" }
```

**Pipeline mapping:**
- `patrocínio` → Pipeline 3 (default)
- `lei / incentivo` → Pipeline 5
- `midia / media / digital` → Pipeline 2
- `licencia / varejo` → Pipeline 4
- `evento / couto` → Pipeline 1

**Stage mapping (Patrocínios):**
- `draft`, `under_review` → Stage 21 (Elaborar Proposta)
- `approved`, `sent` → Stage 20 (Negociação)
- `active_contract` → Deal marked Won
- `rejected` → Deal marked Lost

---

## References

- `26th_May.md` — previous sprint details
- `22nd_May.md` — intern test script
- `E2E_REGRESSION_REPORT.md` — regression notes
- `USER_GUIDE.md` — user-facing guide
- `jersey-assets/README.md` — LoRA training steps

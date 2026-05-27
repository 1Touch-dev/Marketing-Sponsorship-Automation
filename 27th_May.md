# Coritiba FC Platform — Sprint Report (27 May 2026)
**Updated:** 27 May 2026 (evening) | **By:** Abhishek  
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

---

### ✅ D2 — Replicate LoRA Training — Phase 1 + 2 + 3 + 4 COMPLETE

**Full execution summary:**

#### Phase 1 — Training (completed ~12:31 PM)
- **Dataset cleaned:** 3 grayscale mask artifacts removed from original 18 → 15 clean color JPGs
- **Model chosen:** `replicate/fast-flux-trainer` (official Replicate trainer, 8x H100, ~$1.27/run)
- **Destination model created:** `abhishek9302/coritiba-jersey-lora` (private, warm)
- **Training kicked off via API** — Training ID: `ddhg24v8fnrmy0cyd0fbr8cz84`
- **Training completed in 1 min 44 sec** (104.5s predict, 220.6s total)
- **Final loss:** ~0.28–0.38 (clean 20-epoch convergence)
- **Cost:** ~$1.27

**Trained model:**
| Field | Value |
|-------|-------|
| Model | `abhishek9302/coritiba-jersey-lora` |
| Version hash | `396810dbb0770b16510a33406f1de099994d1ff377be7657b0554a5b9e5b625c` |
| Trigger word | `coritiba_jersey` |
| Status | **Warm** (fast-boot H100, ready now) |
| URL | https://replicate.com/abhishek9302/coritiba-jersey-lora |

#### Phase 2 — Quality Validation (5/5 passed ✅)

All 5 test prompts generated high-quality, consistent Coritiba jersey images:

| Prompt type | Result | Prediction ID |
|-------------|--------|---------------|
| Studio product shot (model wearing jersey) | ✅ Green kit, white collar, Diadora + Coritiba badge clearly rendered | `9nvd4ay0jdrmw0cyd0pb09qchw` |
| Flat-lay floating shirt on white BG | ✅ Perfect ecommerce product shot, badge + stars + Diadora visible | `nz95qvp15hrmy0cyd0p8mcdtvc` |
| Athlete running in stadium | ✅ Photorealistic match-day broadcast shot, sponsor text on sleeve | `rkkebme1nsrmy0cyd0pazj2894` |
| Macro close-up of chest/badge | ✅ Detailed textile macro, "CORITIBA" legible on badge | `6ceag2626srmt0cyd0p8wgbke4` |
| Mannequin front view (ecommerce) | ✅ Clean grey BG, white stripes, badge+stars+Diadora, sleeve patches | `3bwj8jy2p9rmy0cyd0pb6dzmdr` |

**Verdict:** Model is production-ready. Consistent jersey identity across all 5 scene types.

#### Phase 3 — App Integration (wired ✅)

New files created:

| File | Purpose |
|------|---------|
| `frontend/lib/replicate/client.ts` | Replicate API client — `startPrediction`, `getPrediction`, `generateImage` (with polling + timeout), `estimateCost` |
| `frontend/app/api/media/replicate/route.ts` | `POST /api/media/replicate` — generate image; `GET /api/media/replicate?prediction_id=` — poll |

Features of the integration:
- Auto-injects `coritiba_jersey` trigger word into every prompt
- Cost guard: hard cap at $0.50/request
- Rate limiting: 10 req/min per IP
- Async: returns immediately with `prediction_id` or waits up to 120s
- Full audit logging via `recordAudit`
- Structured error taxonomy: timeout / configuration / generation_failed
- Health check updated: shows model version + trigger word when configured

Updated env vars:
- `REPLICATE_MODEL_VERSION` added to `.env`, `.env.local`, `.env.example`
- Health check now reports: model version hash + trigger word + training date

#### Phase 4 — UI for Sponsor Mockups (wired ✅)

New component + integrations:

| File | Purpose |
|------|---------|
| `frontend/components/proposals/replicate-jersey-generator.tsx` | `<ReplicateJerseyGenerator>` — prompt builder, scene selector, progressive image grid, download |
| `frontend/app/proposals/[id]/page.tsx` | New "Mockup de Camisa — IA" card added after campaign image generator |
| `frontend/app/media-generation/page.tsx` | Standalone Replicate generator section added to the page |

**Features of the UI component:**
- 5 scene presets: Produto Estúdio (4:5), Modelo em Campo (4:5), Patrocinador no Peito (1:1), Dia de Jogo (16:9), Manequim Frontal (3:4)
- Multi-scene selection with checkboxes (default: Studio + Chest Close-up)
- Custom prompt note field (e.g. "logo vermelho e branco, fundo verde")
- Auto-builds prompt: `coritiba_jersey green football kit with {sponsor} sponsor brand on chest, {scene prompt}`
- Live status display: shows which scene is generating
- Progressive image grid (images appear as each scene completes)
- Per-image: Open link + Download button (auto-named with sponsor+scene)
- Cost estimate shown before generation (~$0.06/scene)
- FLUX LoRA badge with trigger word display
- Tip linking to `/mockup-editor` for logo overlay

**Phase 4 live validation (27 May):**

| Scene | Prompt | Prediction ID | Result |
|-------|--------|---------------|--------|
| Produto Estúdio (4:5) | `coritiba_jersey …with Sicredi sponsor brand on chest, floating jersey on white background…` | `4bvnfjs7y5rmr0cyd10b29zfn4` | ✅ Perfect studio shot |
| Patrocinador no Peito (1:1) | `coritiba_jersey …close up of chest showing sponsor placement area…` | `x8va02c445rmy0cyd109jypg68` | ✅ Clear sponsor area visible |

Both scenes generated in ~10s. Sponsor branding placement confirmed.

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
| Jersey LoRA training zip ready (18→15 cleaned images) | ✅ Trained |
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
| **Media** | Image generation (OpenAI gpt-image-1 + **Replicate FLUX LoRA**) |
| **Barter** | Barter workflow |
| **Lei de Incentivo** | Dedicated pipeline |
| **Health** | `/api/system/health` — DB, Bedrock, Pipedrive, Replicate all healthy |

---

## Current Blockers

| # | Blocker | Owner | Status |
|---|---------|-------|--------|
| 1 | **Pipedrive API token** | James | ✅ RESOLVED (27 May) |
| 2 | **Replicate LoRA training + integration** | Abhishek | ✅ RESOLVED (27 May) |
| 3 | **Dropbox jersey video** | James | Link restricted; PDF images extracted instead |
| 4 | **Intern E2E testing** | Interns | Not started — required before James demo |

---

## Pending Tasks

| # | Task | Est. | Priority |
|---|------|------|----------|
| ~~C5~~ | ~~**Phase 4 — UI for Replicate mockups**~~ | ~~1 day~~ | ✅ Done (27 May) |
| B6 | **Asana integration** — tasks from execution brief | 1 day | Medium |
| B7 | **News/articles** on public landing page | 3–4h | Low |
| — | **Intern test round** (17-point checklist + T18 Replicate image) | Half day | REQUIRED gate |
| — | **Regression after Pipedrive + Replicate** | 2h | Recommended |

---

## Intern Test Checklist (updated — 18 tests)

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
| T18 | **Replicate image**: `POST /api/media/replicate` returns jersey mockup URL | [ ] |
| T19 | **Jersey mockup UI**: open proposal → "Mockup de Camisa — IA" card → generate 2 scenes → images appear | [ ] |

---

## Health Check — Current State

```json
{
  "status": "healthy",
  "services": {
    "database": { "healthy": true, "latency_ms": "~280ms" },
    "bedrock_ai": { "configured": true },
    "openai": { "configured": true },
    "pipedrive": { "configured": true, "healthy": true },
    "replicate": {
      "configured": true,
      "healthy": true,
      "model": "abhishek9302/coritiba-jersey-lora:396810db",
      "trigger_word": "coritiba_jersey",
      "note": "LoRA trained 27 May 2026 — jersey/stadium mockup generation ready"
    }
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

## Suggested Next Steps

| Day | Task |
|-----|------|
| **28 May** | Asana integration (tasks from execution brief) |
| **28–29 May** | Intern full test round (19-point checklist). Fix bugs. Regression. Loom for James. |

---

## API Keys Status (27 May — end of day)

| Key | Status |
|-----|--------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅ Live (Bedrock) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ Live |
| `REPLICATE_API_TOKEN` | ✅ Live — model trained + wired |
| `REPLICATE_MODEL_VERSION` | ✅ `abhishek9302/coritiba-jersey-lora:396810db...` |
| `PIPEDRIVE_API_KEY` | ✅ Live — verified 27 May |
| `OPENAI_API_KEY` | ✅ Live |
| `APIFY_API_TOKEN` | ✅ Live |
| `SERPAPI_KEY` | ✅ Live |
| Hunter.io | ⏳ Not obtained (Ruhani, low priority) |
| ZeroBounce | ⏳ Not obtained (Ruhani, low priority) |
| Placid | ⏳ Not obtained (Ruhani, low priority) |

---

## Replicate Integration — Technical Reference

**Generate a jersey image:**
```bash
curl -X POST https://<your-domain>/api/media/replicate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "sponsor logo on chest of coritiba_jersey green football kit, product shot",
    "num_outputs": 1,
    "aspect_ratio": "1:1"
  }'
```

**Poll async prediction:**
```bash
curl "https://<your-domain>/api/media/replicate?prediction_id=<id>"
```

**Direct Replicate API:**
```bash
curl -X POST https://api.replicate.com/v1/predictions \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -d '{
    "version": "abhishek9302/coritiba-jersey-lora:396810dbb0770b16510a33406f1de099994d1ff377be7657b0554a5b9e5b625c",
    "input": { "prompt": "coritiba_jersey green football kit studio photo" }
  }'
```

**Model details:**
- Trigger word: `coritiba_jersey` (auto-injected by client)
- Hardware: H100 (fast-boot, warm)
- Generation time: ~25–50s per image
- Cost: ~$0.04–0.08 per image
- Training cost: $1.27 (1000 steps, 15 images, 1m 44s)

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
- `REPLICATE_E2E_EXPLORATION_27th_May.md` — full training log, Phase 1–6 plan
- `jersey-assets/README.md` — training dataset notes
- `22nd_May.md` — intern test script
- `E2E_REGRESSION_REPORT.md` — regression notes
- `USER_GUIDE.md` — user-facing guide


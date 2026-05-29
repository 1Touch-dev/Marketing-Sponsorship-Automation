# Coritiba FC Platform — Intern End-to-End Test Plan

**Version:** 2.0 | **Date:** 27 May 2026  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`  
**Pre-test:** Abhishek smoke-tested 27 May — see `E2E_PRE_INTERN_TEST_RESULTS.md`  
**Rule:** Do **not** demo to James until every test below is marked ✅

---

## Before you start

| Item | Detail |
|------|--------|
| Browser | Chrome or Edge, latest version |
| Window | Use **Incognito** for auth tests (T-01–T-03, T-14) |
| DevTools | Keep open (F12) — screenshot any console errors |
| AI waits | Campaign/proposal/email: 30–90s · Jersey mockup: 20–50s · DALL-E: ~30s |
| Test company name | Use **"Test Intern SA"** only in T-05 (will be archived after testing) |
| Email delivery | **Pipedrive only** — no Gmail send. Draft here → log Activity in Pipedrive → rep sends manually |

**Public health checks (no login):**

- `GET /api/health` → `{ "status": "ok", "checks": { "database": { "ok": true } } }`
- `GET /api/system/health` → all services `healthy`

---

## How to use this doc

1. Work sections **top to bottom** (later tests depend on earlier data).
2. Change `[ ]` → `[x]` as you pass each step.
3. On failure: **stop that flow**, note step number + error + screenshot, report to Abhishek.
4. Fill the **Summary Scorecard** at the end.

---

## SECTION 1 — Auth & Security

### T-01 · Login flow

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open platform URL in **Incognito** | Redirect to `/login` | [ ] |
| 2 | Sign in with credentials above | Dashboard loads, no error toast | [ ] |
| 3 | Open `/companies` in same session | List loads (no re-login) | [ ] |

### T-02 · Protected routes

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | New Incognito, go to `/proposals` | Redirect to `/login` | [ ] |
| 2 | Same window, go to `/companies` | Redirect to `/login` | [ ] |
| 3 | Open `/api/health` (no login) | HTTP 200, `"status": "ok"` | [ ] |
| 4 | Open `/api/system/health` (no login) | HTTP 200, `"status": "healthy"` | [ ] |

### T-03 · Logout

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Log out from user menu | Land on `/login` | [ ] |
| 2 | Navigate to `/proposals` | Redirect to `/login` | [ ] |

---

## SECTION 2 — Dashboard & Navigation

### T-04 · Dashboard

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Go to `/` (home) | Dashboard loads with stats/cards | [ ] |
| 2 | Confirm **0 failed workflows** (or no red workflow alert) | Clean dashboard — pre-demo fixes applied | [ ] |

### T-05 · Sidebar — every link loads

Click each link; page must load (no blank screen, no 404):

| Route | Pass |
|-------|------|
| `/` Dashboard | [ ] |
| `/companies` | [ ] |
| `/pipeline` | [ ] |
| `/reports` | [ ] |
| `/proposals/new` | [ ] |
| `/campaigns` | [ ] |
| `/campaigns/bulk` | [ ] |
| `/proposals` | [ ] |
| `/approvals` | [ ] |
| `/emails` | [ ] |
| `/threads` | [ ] |
| `/followups` | [ ] |
| `/coritiba-intelligence` | [ ] |
| `/inventory` | [ ] |
| `/barter` | [ ] |
| `/lei-de-incentivo` | [ ] |
| `/brand-assets` | [ ] |
| `/media-generation` | [ ] |
| `/mockup-editor` | [ ] |
| `/assets` | [ ] |
| `/crm-sync` | [ ] |
| `/workflow-events` | [ ] |
| `/audit` | [ ] |
| `/system` | [ ] |
| `/settings` | [ ] |
| `/users` | [ ] |

### T-06 · Mobile layout

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | DevTools → 375px width | Hamburger / collapsible sidebar works | [ ] |
| 2 | Open `/companies` on mobile width | Usable layout | [ ] |

---

## SECTION 3 — Companies

### T-07 · List & search

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/companies` | List loads (500+ companies) | [ ] |
| 2 | Search **"Sicredi"** or **"Heineken"** | Results filter | [ ] |
| 3 | Open one result | Company detail page | [ ] |

### T-08 · Create company

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/companies/new` | Form loads | [ ] |
| 2 | Name: **Test Intern SA**, Industry: **Tecnologia**, Website: `https://test-intern.example` | Fields accept input | [ ] |
| 3 | Submit | Redirect to detail; status prospect | [ ] |
| 4 | `/companies` — search **Test Intern** | New company visible | [ ] |

### T-09 · AI intelligence

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open **Sicredi** or **Positivo Tecnologia** | Detail page | [ ] |
| 2 | Run **Intelligence** / **Analyze** | Spinner ~30–60s | [ ] |
| 3 | Panel fills | Overview, fit, competitors (≥2), news | [ ] |

### T-10 · Edit company

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open **Test Intern SA** from T-08 | Detail | [ ] |
| 2 | Edit notes, save | Persists after refresh | [ ] |

---

## SECTION 4 — Campaigns

### T-11 · Single AI campaign

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/campaigns` | List loads | [ ] |
| 2 | Create / generate for **Test Intern SA** | Form works | [ ] |
| 3 | Generate | Completes ~30s; appears in list | [ ] |
| 4 | Open campaign | Title, summary, strategy visible | [ ] |

### T-12 · Bulk campaigns

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/campaigns/bulk` | Page loads | [ ] |
| 2 | Industry **Automotivo**, count **3** | Selected | [ ] |
| 3 | Generate | Progress; ~2–3 min | [ ] |
| 4 | `/campaigns` | 3 new campaigns visible | [ ] |

---

## SECTION 5 — Proposals (core flow)

### T-13 · Proposal wizard

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/proposals/new` | Wizard step 1 | [ ] |
| 2 | Company: **Test Intern SA**, campaign from T-11 | Selected | [ ] |
| 3 | Complete wizard → Generate | Proposal detail; status **draft** | [ ] |
| 4 | Content sections present | Executive summary or rationale visible | [ ] |

### T-14 · Approval workflow

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Proposal from T-13 → Submit for review | **under_review** | [ ] |
| 2 | `/approvals` | Proposal in queue | [ ] |
| 3 | Approve | **approved** | [ ] |
| 4 | Mark active contract (if available) | **active_contract** | [ ] |

### T-15 · Revision loop

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | New proposal → submit for review | **under_review** | [ ] |
| 2 | `/approvals` → Request revision | **revision_requested** | [ ] |
| 3 | Edit title on proposal, save | Version increments | [ ] |
| 4 | Re-submit → approve | **approved** | [ ] |

### T-16 · AI enhance (strategies + pricing)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open draft or approved proposal | Detail | [ ] |
| 2 | **Enhance** | ~30–60s | [ ] |
| 3 | Strategy variants A/B/C | Cards visible | [ ] |
| 4 | Pricing tiers | Bronze/Silver/Gold or similar | [ ] |
| 5 | Visual prompt suggestions | ≥1 listed | [ ] |

### T-17 · Execution brief

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Enhanced proposal → **Execution Brief** card | Card visible | [ ] |
| 2 | Generate brief | ~30–60s | [ ] |
| 3 | Brief content | Action items, resources, risks per strategy | [ ] |

### T-18 · Public share link

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Enhanced proposal → Share | URL with token | [ ] |
| 2 | Open URL in **Incognito** | No login; landing loads | [ ] |
| 3 | Content | Company, strategies, pricing | [ ] |
| 4 | **Próximas Partidas** (if shown) | Match section OK or empty — not an error | [ ] |

### T-19 · Brand assets on proposal

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Proposal detail → **Brand Assets** | Uploader visible | [ ] |
| 2 | Upload small PNG/JPG logo | Listed after upload | [ ] |
| 3 | Refresh | Asset still there | [ ] |

### T-20 · Proposal duplication

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Duplicate any proposal | Copy created | [ ] |
| 2 | New proposal status | **draft** | [ ] |

### T-21 · Proposal block editor (optional)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/proposals/[id]/blocks` from proposal menu | Block editor loads | [ ] |
| 2 | Edit a text block, save | Saves without error | [ ] |

---

## SECTION 6 — AI images (DALL-E)

### T-22 · Campaign creatives on proposal

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Enhanced proposal → **Imagens de Campanha** | Card visible | [ ] |
| 2 | **Gerar Criativos** | ~30s; ≥1 image | [ ] |
| 3 | `/media-generation` | Job listed **completed** | [ ] |

### T-23 · Media generation page

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/media-generation` | Stats + job table | [ ] |
| 2 | Counters match rows | Consistent | [ ] |

### T-24 · Visual mockups page (`/media`)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/media` | Mockup types: jersey, LED, banner, etc. | [ ] |
| 2 | Create one mockup entry (form) | Saved in list | [ ] |

---

## SECTION 7 — Replicate jersey mockups (FLUX LoRA)

### T-25 · Jersey UI on proposal

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Proposal detail → **Mockup de Camisa — IA** | FLUX LoRA card | [ ] |
| 2 | Select 2 scenes (e.g. Produto Estúdio + Patrocinador no Peito) | Checked | [ ] |
| 3 | **Gerar Mockups de Camisa** | Progressive loading | [ ] |
| 4 | Both images in grid | Download + Abrir work | [ ] |

### T-26 · Standalone generator

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/media-generation` → FLUX LoRA section | Visible | [ ] |
| 2 | 1 scene, generate | Image ~20–50s | [ ] |

### T-27 · API smoke (optional — DevTools)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | While logged in: POST `/api/media/replicate` body `{"prompt":"coritiba_jersey studio shot","num_outputs":1}` | 200 + `output_urls` | [ ] |
| 2 | Open first URL | Jersey image loads | [ ] |

---

## SECTION 8 — Mockup editor (Konva)

### T-28 · Canvas editor

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/mockup-editor` | Canvas loads | [ ] |
| 2 | Pick jersey or stadium template | On canvas | [ ] |
| 3 | Add text, drag/resize | Works | [ ] |
| 4 | Export PNG | File downloads | [ ] |

---

## SECTION 9 — Inventory

### T-29 · Inventory CRUD

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/inventory` | ~26 items listed | [ ] |
| 2 | Add **digital** item (e.g. Instagram Post) with price range | Saved | [ ] |
| 3 | Add **physical** item (e.g. Placa LED) with placement | Saved | [ ] |
| 4 | Both in list with correct type/category | Visible | [ ] |

### T-30 · Inventory on proposal wizard (optional)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/proposals/new` — inventory step | Lines selectable | [ ] |
| 2 | Select 2 lines, generate proposal | Lines attached to proposal | [ ] |

---

## SECTION 10 — Pipeline

### T-31 · Pipeline board

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/pipeline` | Kanban columns load | [ ] |
| 2 | Add lead: **Test Intern SA**, stage Prospect | Card in column | [ ] |
| 3 | Move to Qualified | Card moves | [ ] |

---

## SECTION 11 — CRM / Pipedrive

### T-32 · CRM sync page

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/crm-sync` | Page loads | [ ] |
| 2 | Banner | **Pipedrive connected** (green) | [ ] |
| 3 | Queue table | Rows: synced / pending | [ ] |

### T-33 · Sync on approval

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Approve proposal (T-14) | **approved** | [ ] |
| 2 | `/crm-sync` | New row for proposal/deal | [ ] |
| 3 | Status | **synced** (not failed) | [ ] |

---

## SECTION 12 — Reports

### T-34 · Sponsor report

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Use proposal with **active_contract** (e.g. Heineken — or from T-14) | — | [ ] |
| 2 | `/reports` | Active sponsors listed | [ ] |
| 3 | Generate report | ~30s; KPIs + summary | [ ] |
| 4 | Download / open | PDF or share works | [ ] |

---

## SECTION 13 — Barter

### T-35 · Barter items

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/barter` | Stats + list | [ ] |
| 2 | Add item: name, current price 1000, target 800, priority Medium | Form fields match UI labels | [ ] |
| 3 | Submit | Open / savings shown | [ ] |
| 4 | Status → In negotiation | Updates | [ ] |

---

## SECTION 14 — Lei de Incentivo

### T-36 · Social project

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/lei-de-incentivo` | Page loads | [ ] |
| 2 | Add project: name, type **Esporte**, budget 50000 | Form OK | [ ] |
| 3 | Submit | Card on page | [ ] |

---

## SECTION 15 — Outreach emails (Pipedrive)

> **Important:** Emails are **not** sent via Gmail. Flow: AI draft → **Approve & log to Pipedrive** → rep sends from their mail client.

### T-37 · Generate & Pipedrive log

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | **Approved** proposal | Detail | [ ] |
| 2 | Outreach panel active (not grayed) | Generate Email visible | [ ] |
| 3 | Recipient + contact → Generate | Draft ~15s; PT-BR body | [ ] |
| 4 | `/emails` | Status draft | [ ] |
| 5 | **Approve & log to Pipedrive** | Green: Activity #… | [ ] |
| 6 | **Mark as Sent in Pipedrive** | Status **sent** | [ ] |

### T-38 · Follow-up

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Sent email → Generate follow-up | New draft | [ ] |
| 2 | `/followups` | Entry listed | [ ] |

### T-39 · Settings — Gmail card (expect optional)

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/settings` | Gmail card says **optional**; Pipedrive handles outreach | [ ] |
| 2 | Do **not** require Gmail connect for T-37 | T-37 still passes | [ ] |

### T-40 · Threads page

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/threads` | Loads; description mentions optional Gmail sync | [ ] |
| 2 | Empty state OK if no threads | No crash | [ ] |

---

## SECTION 16 — Brand assets library

### T-41 · Brand assets page

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/brand-assets` | Coritiba asset types (jersey, LED, etc.) | [ ] |
| 2 | Copy / view guidance text | Readable | [ ] |

### T-42 · Asset library

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/assets` | Library loads | [ ] |
| 2 | Filter or list jobs/assets | No error | [ ] |

---

## SECTION 17 — Coritiba intelligence

### T-43 · Metrics dashboard

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/coritiba-intelligence` | Categories: city, club, fanbase, stadium, etc. | [ ] |
| 2 | Add or edit one metric (if form shown) | Saves | [ ] |

---

## SECTION 18 — Audit & workflows

### T-44 · Audit log

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/audit` | Table loads | [ ] |
| 2 | Today's actions visible | proposal, email, company events | [ ] |
| 3 | Filter/search | Works | [ ] |

### T-45 · Workflow events

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/workflow-events` | List loads | [ ] |
| 2 | No **failed** rows from old Gmail/Bedrock errors | 0 failed (or only new failures you caused) | [ ] |

---

## SECTION 19 — System health & maintenance

### T-46 · Health APIs

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/api/health` | `"status": "ok"`, database ok | [ ] |
| 2 | `/api/system/health` | `"status": "healthy"` | [ ] |
| 3 | `services.database`, `bedrock_ai`, `openai`, `pipedrive`, `replicate` | all healthy / configured | [ ] |
| 4 | Replicate note | LoRA model `396810db` mentioned | [ ] |

### T-47 · System maintenance page

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/system` | All services green | [ ] |
| 2 | Failed workflows count | **0** | [ ] |
| 3 | Test companies visible | **0** (Test Intern archived) | [ ] |

### T-48 · Team & users

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | `/users` | `patrocinios@coritiba.com.br` admin, active | [ ] |

---

## SECTION 20 — End-to-end golden path (James demo script)

Run this **once** as a single story after individual tests pass:

| # | Step | Pass |
|---|------|------|
| 1 | Login → Dashboard clean (0 failed workflows) | [ ] |
| 2 | Companies → open **Heineken** or **Positivo** → show intelligence | [ ] |
| 3 | Campaigns → show one AI campaign | [ ] |
| 4 | Proposals → open **approved** proposal → Enhance + Execution brief | [ ] |
| 5 | Generate DALL-E creatives + Replicate jersey mockup (2 scenes) | [ ] |
| 6 | Share link → open in Incognito | [ ] |
| 7 | Approve flow on **new** test proposal → CRM sync row **synced** | [ ] |
| 8 | Email: generate → Pipedrive approve → sent | [ ] |
| 9 | `/crm-sync` green + `/system` all green | [ ] |
| 10 | `/reports` generate for active sponsor | [ ] |

---

## Summary scorecard

| Section | Tests | Pass | Fail |
|---------|-------|------|------|
| Auth & Security | T-01–T-03 | | |
| Dashboard & Nav | T-04–T-06 | | |
| Companies | T-07–T-10 | | |
| Campaigns | T-11–T-12 | | |
| Proposals | T-13–T-21 | | |
| DALL-E / Media | T-22–T-24 | | |
| Replicate LoRA | T-25–T-27 | | |
| Mockup Editor | T-28 | | |
| Inventory | T-29–T-30 | | |
| Pipeline | T-31 | | |
| CRM / Pipedrive | T-32–T-33 | | |
| Reports | T-34 | | |
| Barter | T-35 | | |
| Lei de Incentivo | T-36 | | |
| Emails / Pipedrive | T-37–T-40 | | |
| Brand / Assets | T-41–T-42 | | |
| Coritiba Intel | T-43 | | |
| Audit / Workflows | T-44–T-45 | | |
| System Health | T-46–T-48 | | |
| Golden path | T-49 (demo script) | | |
| Outreach Agent | T-50 | | |
| **TOTAL** | **50 test groups** | | |

---

## SECTION 10 — Outreach Agent (James requirements)

**Where:** Any company page with a website (e.g. Red Bull Brasil) → **Outreach Agent** panel at top.

**Expected flow (dual approval):**

| Step | Action | Pass? |
|------|--------|-------|
| T-50-1 | Click **Run Agent** — steps show: enrich → scrape → generate proposal | [ ] |
| T-50-2 | Wait 1–3 min — panel pauses with **Personalized Proposal Ready** (blue box) | [ ] |
| T-50-3 | Click **Open full proposal** — new tab shows proposal with company-specific content (not generic) | [ ] |
| T-50-4 | Click **Approve Proposal & Draft Email** — wait ~30s — panel shows **Email Draft Ready** (amber box) | [ ] |
| T-50-5 | Review To/Subject/Preview — click **Approve & Send** | [ ] |
| T-50-6 | Panel shows **Outreach Complete** + Pipedrive activity ID | [ ] |
| T-50-7 | In Pipedrive, find activity linked to company org/deal (not floating) | [ ] |

**Notes:** No Auto mode — both proposal and email require human approval. If proposal step fails, run **Enrich Contacts** first on that company.

---

## Common failures

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| White / blank page | JS error | Console screenshot → Abhishek |
| Spinner never ends | AI timeout / rate limit | Wait 1 min, retry once; note endpoint |
| 401 on API | Not logged in | Re-login |
| Pipedrive sync failed | Deal/org missing | Check `/crm-sync` row error |
| Image gen failed | OpenAI/Replicate limit | Retry; check `/api/system/health` |
| "Approve email" grayed | Proposal not **approved** | Complete T-14 first |
| Gmail connect suggested | Optional only | Skip — use Pipedrive buttons on email page |
| Old failed workflows on dashboard | Stale UI | Hard refresh; confirm `/system` shows 0 failed |

---

## After testing — cleanup

Ask Abhishek to run on `/system` (if test data left behind):

- **Archive Test Companies** (Test Intern SA, etc.)
- **Resolve Failed Workflows** (only if you created new failures)

---

*Report failures: screenshot + URL + step ID (e.g. T-25-3) + error message.*

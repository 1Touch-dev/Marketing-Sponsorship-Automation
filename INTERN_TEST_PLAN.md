# Coritiba FC Platform — Intern End-to-End Test Plan
**Version:** 1.0 | **Date:** 27 May 2026  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login credentials:** `patrocinios@coritiba.com.br` / *(ask Abhishek for password)*  
**Rule:** Do NOT demo to James until every test below has a ✅

---

## How to use this doc
1. Work through each section top-to-bottom.
2. Mark `[ ]` → `[x]` as you pass each step.
3. If a step fails, write the error in the "Notes" column and stop that flow — report to Abhishek.
4. Screenshot failures.

---

## SECTION 1 — Auth & Security

### T-01 · Login flow
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open https://eligibly-facing-unloved.ngrok-free.dev (incognito) | Redirected to `/login` | [ ] |
| 2 | Enter correct credentials and click Sign In | Lands on dashboard / home page, no error | [ ] |
| 3 | Open any protected page URL directly (e.g. `/companies`) | Page loads normally (already logged in) | [ ] |

### T-02 · Protected routes redirect
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open a new incognito window | Not logged in | [ ] |
| 2 | Navigate directly to `/proposals` | Redirected to `/login` | [ ] |
| 3 | Navigate directly to `/companies` | Redirected to `/login` | [ ] |
| 4 | Navigate directly to `/api/system/health` | Returns JSON (public endpoint, allowed) | [ ] |

### T-03 · Logout
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Click the user menu / logout button | Redirected to `/login` | [ ] |
| 2 | Press back button or navigate to `/proposals` | Redirected to `/login` (session cleared) | [ ] |

---

## SECTION 2 — Companies

### T-04 · Company list & search
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/companies` | List loads, shows 500+ companies | [ ] |
| 2 | Type a company name in search box | List filters in real time | [ ] |
| 3 | Click a company | Company detail page opens | [ ] |

### T-05 · Create a new company
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/companies/new` | Form page loads | [ ] |
| 2 | Fill in: Name = "Test Intern SA", Industry = "Tecnologia", Website = "https://test.com" | Fields accept input | [ ] |
| 3 | Submit | Company created, redirected to company detail | [ ] |
| 4 | Verify company appears in the list | New entry visible | [ ] |

### T-06 · Run AI Intelligence on a company
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open an existing company (use "Sicredi" or any real one) | Detail page loads | [ ] |
| 2 | Click "Run Intelligence" / "Analyze" button | Spinner appears | [ ] |
| 3 | Wait for completion (~30–60s) | Intelligence panel fills in: overview, competitors, news, fit score | [ ] |
| 4 | Verify "Competitors" section shows at least 2 results | Competitor names displayed | [ ] |

### T-07 · Edit a company
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open company created in T-05 | Detail page | [ ] |
| 2 | Click Edit, change the notes field | Input accepts changes | [ ] |
| 3 | Save | Changes persisted, page reflects update | [ ] |

---

## SECTION 3 — Campaigns

### T-08 · Single AI campaign generation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/campaigns` | List loads | [ ] |
| 2 | Click "New Campaign" or AI generate button | Form / dialog appears | [ ] |
| 3 | Select a company, enter a context / campaign title | Fields filled | [ ] |
| 4 | Click Generate | Spinner visible; campaign appears in list within ~30s | [ ] |
| 5 | Open the campaign | Shows title, summary, strategy | [ ] |

### T-09 · Bulk campaign generation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/campaigns/bulk` | Bulk generation page loads | [ ] |
| 2 | Select industry "Automotivo", set count to 5 | Selection confirmed | [ ] |
| 3 | Click Generate | Progress indicator shows; completes in ~2–3 min | [ ] |
| 4 | Check `/campaigns` list | 5 new campaigns appear | [ ] |

---

## SECTION 4 — Proposals (Core flow)

### T-10 · Create a new proposal (wizard)
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/proposals/new` | Wizard step 1 loads | [ ] |
| 2 | Select a company, select a campaign | Fields confirmed | [ ] |
| 3 | Click through wizard steps, fill required fields | Steps progress | [ ] |
| 4 | Submit / Generate | Proposal created; lands on proposal detail | [ ] |
| 5 | Verify proposal has: title, company name, status = "draft" | All fields present | [ ] |

### T-11 · Full approval flow
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open the proposal from T-10 | Detail page | [ ] |
| 2 | Submit for review | Status → `under_review` | [ ] |
| 3 | Navigate to `/approvals` | Proposal appears in pending list | [ ] |
| 4 | Approve it | Status → `approved` | [ ] |
| 5 | On proposal page: click "Mark as Active Contract" (or equivalent) | Status → `active_contract` | [ ] |

### T-12 · Revision loop
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Create a fresh proposal and submit for review | Status = `under_review` | [ ] |
| 2 | From `/approvals`, click "Request Revision" | Status → `revision_requested`; banner appears on proposal | [ ] |
| 3 | Open proposal, click "Edit now" | Edit page loads | [ ] |
| 4 | Change proposal title, save | Version number increments by 1 | [ ] |
| 5 | Re-submit for review | Status → `under_review` | [ ] |
| 6 | Approve | Status → `approved` | [ ] |

### T-13 · AI Enhancement (strategy variants + pricing tiers)
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open any draft/approved proposal | Detail page | [ ] |
| 2 | Click "Enhance" button | Spinner; takes ~30–60s | [ ] |
| 3 | After completion: verify "Apresentação Premium" section appears | Strategy cards (A/B/C) visible | [ ] |
| 4 | Verify pricing tiers are shown (Bronze/Silver/Gold or similar) | Tier cards visible | [ ] |
| 5 | Verify visual prompt suggestions are listed | At least 1 visual prompt shown | [ ] |

### T-14 · Public share link
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open an enhanced proposal | Detail page | [ ] |
| 2 | Click "Share" / generate share link | Share URL appears (contains token) | [ ] |
| 3 | Open the URL in a **new incognito window** | Landing page loads — no login required | [ ] |
| 4 | Verify landing page shows: company name, strategy cards, pricing | Content visible | [ ] |
| 5 | Verify "Próximas Partidas" (upcoming matches) section appears | Match dates shown | [ ] |

### T-15 · Brand asset upload
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open a proposal detail page | Detail page | [ ] |
| 2 | Scroll to "Brand Assets" card | Uploader visible | [ ] |
| 3 | Upload a PNG/JPG file (any small logo) | Upload progress shows; file listed | [ ] |
| 4 | Refresh page | Asset still present | [ ] |

### T-16 · Proposal duplication
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open a proposal | Detail page | [ ] |
| 2 | Click "Duplicate" button | New proposal created with "(copy)" suffix | [ ] |
| 3 | Verify new proposal is in `draft` status | Status badge correct | [ ] |

---

## SECTION 5 — AI Image Generation (DALL-E pipeline)

### T-17 · Campaign image generation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open a proposal that has strategy variants | Detail page | [ ] |
| 2 | Scroll to "Imagens de Campanha" card | Card visible | [ ] |
| 3 | Click "Gerar Criativos" | Spinner; images generated within ~30s | [ ] |
| 4 | Verify image(s) appear in the card | At least 1 image visible | [ ] |
| 5 | Navigate to `/media-generation` | Jobs appear in the list | [ ] |

### T-18 · Media generation page — full job view
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/media-generation` | Page loads; stats cards visible | [ ] |
| 2 | Verify job table shows jobs from T-17 | Jobs listed with status "completed" | [ ] |
| 3 | Check stat counters (pending / approved / completed) | Numbers match visible rows | [ ] |

---

## SECTION 6 — Replicate Jersey Mockups (FLUX LoRA)

### T-19 · API smoke test
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open browser DevTools → Network tab, or use Postman | — | [ ] |
| 2 | POST to `/api/media/replicate` with body: `{"prompt": "coritiba_jersey studio product shot with sponsor logo", "num_outputs": 1}` | HTTP 200 with `output_urls`, `prediction_id`, `duration_ms` | [ ] |
| 3 | Copy the `output_urls[0]` URL and open it | Photo-realistic Coritiba jersey image visible | [ ] |

### T-20 · Jersey mockup UI on proposal page
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open any proposal detail page | Detail page loads | [ ] |
| 2 | Scroll down to "Mockup de Camisa — IA" card | Card visible with FLUX LoRA badge | [ ] |
| 3 | Click the scene selector toggle | 5 scene presets shown as checkboxes | [ ] |
| 4 | Select 2 scenes (e.g. "Produto Estúdio" + "Patrocinador no Peito") | Checkboxes selected | [ ] |
| 5 | (Optional) Type a custom note in the text field | Input accepts text | [ ] |
| 6 | Click "Gerar Mockups de Camisa" | Button shows spinner; "Gerando: Produto Estúdio…" | [ ] |
| 7 | Wait ~20s | First image appears while second is generating | [ ] |
| 8 | Wait for completion | Both images visible in grid with labels | [ ] |
| 9 | Click "Abrir" link on first image | Image opens in new tab | [ ] |
| 10 | Click "Download" | Browser downloads the .webp file | [ ] |

### T-21 · Standalone mockup generator on media-generation page
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/media-generation` | Page loads | [ ] |
| 2 | Scroll to "Mockup de Camisa — FLUX LoRA" section | Section visible | [ ] |
| 3 | Select 1 scene, click generate | Image generated and displayed | [ ] |

---

## SECTION 7 — Mockup Editor

### T-22 · Konva canvas editor
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/mockup-editor` | Editor canvas loads | [ ] |
| 2 | Select a template (jersey or stadium) | Template appears on canvas | [ ] |
| 3 | Add a text element | Text layer appears on canvas | [ ] |
| 4 | Move/resize an element | Dragging works | [ ] |
| 5 | Click Export / Download | PNG downloaded | [ ] |

---

## SECTION 8 — Inventory

### T-23 · Inventory management
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/inventory` | Inventory items listed | [ ] |
| 2 | Click "Add item" or equivalent | Form appears | [ ] |
| 3 | Create a **digital** item (e.g. "Social Post — Instagram") with a price | Item saved | [ ] |
| 4 | Create a **physical** item (e.g. "Placa LED — Beira Campo") with dimensions | Item saved | [ ] |
| 5 | Verify both items appear in the list with correct type | Digital / Physical badges visible | [ ] |

---

## SECTION 9 — Pipeline (Sales Pipeline)

### T-24 · Pipeline leads board
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/pipeline` | Kanban-style board loads with stage columns | [ ] |
| 2 | Click "Add Lead" / new lead button | Form opens | [ ] |
| 3 | Create a lead: company = any, stage = "Prospect" | Lead card appears in Prospect column | [ ] |
| 4 | Drag the lead card to "Qualified" | Card moves to Qualified column | [ ] |

---

## SECTION 10 — CRM Sync (Pipedrive)

### T-25 · Pipedrive connection status
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/crm-sync` | Page loads | [ ] |
| 2 | Check the banner at top | **Green banner: "✓ Pipedrive Conectado — Coritiba FC"** | [ ] |
| 3 | Verify sync queue table shows recent entries | Rows with statuses: synced / pending / failed | [ ] |

### T-26 · Live Pipedrive sync triggered by proposal approval
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Approve a proposal (or use one approved in T-11) | Status = `approved` | [ ] |
| 2 | Navigate to `/crm-sync` | New entry appears in sync queue | [ ] |
| 3 | Status column shows "synced" for that proposal | No error | [ ] |

---

## SECTION 11 — Reports

### T-27 · Monthly sponsor report generation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Ensure at least 1 proposal has status `active_contract` (from T-11) | — | [ ] |
| 2 | Navigate to `/reports` | Active sponsors listed | [ ] |
| 3 | Click "Generate Report" for an active sponsor | Spinner; completes in ~30s | [ ] |
| 4 | Report appears with: KPIs, campaign summary, ROI estimate | Content rendered | [ ] |
| 5 | Click Download (PDF or share link) | File downloads or link opens | [ ] |

---

## SECTION 12 — Barter

### T-28 · Barter item management
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/barter` | Page loads; stats cards visible | [ ] |
| 2 | Click "Add Item" | Form appears | [ ] |
| 3 | Fill in: vendor = "Test Vendor", current price = 1000, target price = 800, priority = Medium | — | [ ] |
| 4 | Submit | Item appears in "Open" column with potential savings = R$200 | [ ] |
| 5 | Change status to "In Negotiation" | Item moves to In Negotiation section | [ ] |

---

## SECTION 13 — Lei de Incentivo

### T-29 · Social project creation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/lei-de-incentivo` | Page loads | [ ] |
| 2 | Click "Add Project" | Form opens | [ ] |
| 3 | Fill: name = "Projeto Esporte Intern", type = "Esporte", budget = 50000 | — | [ ] |
| 4 | Submit | Project card appears on page | [ ] |

---

## SECTION 14 — Outreach Emails

### T-30 · Generate outreach email
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open an **approved** proposal | Detail page | [ ] |
| 2 | Scroll to "Outreach" section | "Generate Email" panel visible (not grayed out) | [ ] |
| 3 | Click "Generate Email" | AI drafts an outreach email in ~15s | [ ] |
| 4 | Email body displayed | Professional Portuguese-language email mentioning the sponsor and Coritiba | [ ] |
| 5 | Navigate to `/emails` | Email appears in the list | [ ] |

---

## SECTION 15 — Audit Log

### T-31 · Audit trail
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/audit` | Audit log table loads | [ ] |
| 2 | Verify entries from today's testing session appear | Actions like "proposal_created", "approval_decision" visible | [ ] |
| 3 | Use search/filter to find a specific entity | Filter works correctly | [ ] |

---

## SECTION 16 — System Health

### T-32 · Health check API
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/api/system/health` | JSON response displayed | [ ] |
| 2 | Check `status` field | `"healthy"` | [ ] |
| 3 | Check `services.database.healthy` | `true` | [ ] |
| 4 | Check `services.pipedrive.healthy` | `true` | [ ] |
| 5 | Check `services.replicate.configured` | `true`, model hash visible | [ ] |

### T-33 · System page
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Navigate to `/system` | System page loads with service statuses | [ ] |
| 2 | All service indicators show green | No red/amber alerts | [ ] |

---

## SECTION 17 — Navigation & UI Polish

### T-34 · Sidebar navigation
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Click through every sidebar link | All pages load without blank screen or 404 | [ ] |
| 2 | Check on mobile viewport (375px width in DevTools) | Sidebar collapses / hamburger menu works | [ ] |

### T-35 · No broken pages
| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Visit `/approvals` | Page loads, shows queue | [ ] |
| 2 | Visit `/assets` | Page loads | [ ] |
| 3 | Visit `/followups` | Page loads | [ ] |
| 4 | Visit `/workflow-events` | Page loads | [ ] |
| 5 | Visit `/users` | Page loads | [ ] |
| 6 | Visit `/settings` | Page loads | [ ] |
| 7 | Visit `/coritiba-intelligence` | Intelligence dashboard loads | [ ] |

---

## Summary Scorecard

| Section | Tests | Pass | Fail |
|---------|-------|------|------|
| Auth & Security | T01–T03 | | |
| Companies | T04–T07 | | |
| Campaigns | T08–T09 | | |
| Proposals | T10–T16 | | |
| DALL-E Image Gen | T17–T18 | | |
| Replicate LoRA | T19–T21 | | |
| Mockup Editor | T22 | | |
| Inventory | T23 | | |
| Pipeline | T24 | | |
| CRM Sync / Pipedrive | T25–T26 | | |
| Reports | T27 | | |
| Barter | T28 | | |
| Lei de Incentivo | T29 | | |
| Emails | T30 | | |
| Audit Log | T31 | | |
| System Health | T32–T33 | | |
| Navigation / UI | T34–T35 | | |
| **TOTAL** | **35 tests** | | |

---

## Common failure patterns to watch for

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| Page loads blank / white screen | JS error | Open DevTools console, screenshot error, report |
| "Failed to fetch" error | API route down | Check `/api/system/health` |
| Spinner never stops | Timeout or missing API key | Check network tab, report endpoint + status code |
| Image generation returns error | OpenAI or Replicate rate limit | Wait 1 min and retry once |
| Pipedrive sync shows "failed" | Token issue | Check `/crm-sync`, report row details |
| 500 error on approval | DB issue | Screenshot full error, report |

---

*Report all failures to Abhishek with: screenshot + URL + error message + step number.*

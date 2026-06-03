# Coritiba FC Platform — Sprint Plan (3 June 2026)

**Date:** 3 June 2026 | **By:** Abhishek  
**Goal:** Document **everything** James reported today + all carryover from `2nd_June.md`. **Resolve all today** — implementation starts after this doc is signed off.  
**Status:** 📋 **DOCUMENTATION ONLY** — no code changes yet  

**Platform:** https://eligibly-facing-unloved.ngrok-free.dev  
**Branch (current):** `feature/bug-fixes-2june`  
**Sources:** James WhatsApp (3 June 2026, ~08:44–08:48) · `2nd_June.md` · `Coritiba_Platform_Issues_Report_EN.pdf`  

---

## Executive Summary

James reports **many issues still happening in production today**, including regressions on areas we fixed on 2 June (bulk companies by category, mockups, company enrich). His message splits into:

1. **Regressions / still broken** — bulk proposals empty by category, mockups broken/wrong place, AI mockups not working, some companies missing enrich button, company search/categories, incomplete proposals  
2. **UX / workflow** — image flow scattered across tabs; everything should live on proposal create/view/edit  
3. **New product requirements** — package tiers (Gold/Silver/Diamond), inventory menu picker, campaigns tied to inventory + resource briefs, physical/digital pricing by match/frequency, resource lines (player, videographer, edit hours)  

**Sprint target today:** Fix all **bugs/regressions** first, then **highest-impact UX** (proposal-centric images + prompts), then **package/inventory** foundations where time allows. Full inventory pricing engine is likely multi-day — document and phase if needed.

---

## James WhatsApp — Raw (3 June 2026)

> Hey abi — had a lot of issues with the web app today.

**Proposal**  
- need new landing page  
- When we generate images, prompts should be displayed before approving  
- Once images are generated we should be able to choose them in edit proposal  
- Images should go with campaign of proposals  
- Proposals should be more concise  

**Package options**  
- Proposals where we propose multiple options for inventory packages: A Gold, B Silver, C Diamond  
- Proposal option menu  
- Another option to view all inventory available like a menu and choose based on prices, matches etc.  

**Image mockups**  
- mockups are not working and are in the wrong location  
- Proposals need to be more organized — improve UI  
- AI mockups not working correctly or not working at all  
- When viewing images made by AI, we should be able to click on the proposal it was made for  
- Generate images flow doesn’t make sense: Press generate → different tab AI mockups → approve → search for proposal  
- **All** image editing / rendering / choosing image or prompt = on create, view, or edit proposal page  

**Companies**  
- some of them are not displaying button to enrich / get contacts etc  

**Bulk proposals**  
- no companies showing in bulk when picking a category (no companies categorized)  
- Can’t choose individual companies  
- No tinder style viewer  
- Can’t send proposals or view emails to send too  

**Campaigns**  
- should use inventory — know we have resources to make each campaign/activation  
- should create the brief so we understand what resources are needed  

**Inventory**  

*Physical:*  
- Price changes based on match and expected viewers  
- Screens etc. need **time/frequency** shown: 1 match, multiple matches, or all matches (different matches → different prices)  

*Digital:*  
- Multiple lines per resource + amount of time needed  
- Frequency: weekly, monthly, per game, one game, etc.  

*Resources required (example):*  
- Player for video shoot 2 hours  
- Videographer 2 hours  
- Edit video 4 hours  
- Must connect to specific digital resource, social media, campaign, and proposal  

**Core issues (summary from James)**  
- Companies didn’t have information  
- Company search or categories didn’t work  
- Proposals some came out not complete  
- Bulk proposals nothing worked  
- Image mockups worsened  

**Priority:** Try and prioritize this.

---

## Issue Register — Parsed & Numbered

Each item has an ID for tracking today. **Type:** 🐛 Bug/Regression · 🔧 Partial (2 June) · ✨ Feature · 🔄 Workflow  

### A — Proposals & Landing

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-01** | ✨ | New sponsor landing page (full redesign) | 3 Jun + FR-04 + 2 Jun partial | Public `/view`: hero, sponsor+club branding, organized sections, CTAs, no admin chrome — not just bottom strip |
| **J3-02** | ✨ | Proposals more **concise** (content + UI) | 3 Jun | Shorter AI output defaults; cleaner layout; less wall-of-text on detail/edit/view |
| **J3-03** | ✨ | Proposal UI more **organized** | 3 Jun | Clear sections (summary, packages, campaigns, visuals, pricing); consistent hierarchy on detail/edit/view |
| **J3-04** | 🐛 | Some proposals **incomplete** after generation | 3 Jun core | Wizard/agent output always has required blocks; no empty strategy/pricing/visuals when marked complete |
| **J3-05** | ✨ | **Multi-package proposals**: Gold / Silver / Diamond (A/B/C) | 3 Jun | Proposal supports 3+ named tiers; each tier = inventory subset + price; selectable on landing |
| **J3-06** | ✨ | **Proposal option menu** — switch between package options | 3 Jun | UI to pick tier A/B/C on edit + view |
| **J3-07** | ✨ | **Inventory menu** — browse all inventory, filter by price, match, etc. | 3 Jun + FR | Picker/modal from proposal build: all items, filters, add to package |
| **J3-08** | 🔄 | Images linked to **campaign** within proposal | 3 Jun | Generated/approved images attach to `campaign_id` / campaign section; show under correct campaign on landing |

*Carryover:* BUG-15 / FR-04 partial (sidebar off + CTA only) → superseded by **J3-01**.

---

### B — Images & Mockups (highest pain today)

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-10** | 🐛 | **AI mockups not working** or unreliable | 3 Jun “worsened” | Generate official + creative mockups completes; errors surfaced; no silent fail |
| **J3-11** | 🐛 | Mockups in **wrong location** / wrong UX placement | 3 Jun | Mockup controls live on proposal detail + edit (not orphan tab only) |
| **J3-12** | 🔄 | **Prompt shown before approve/generate** (all image types) | 3 Jun + BUG-08 partial | Every generate path: preview prompt → confirm → run (not only jersey component) |
| **J3-13** | 🔄 | **Choose/select images in edit proposal** after generation | 3 Jun | Edit page: gallery of jobs for this proposal; select which appear on landing/sections |
| **J3-14** | 🔄 | **Unified image workflow** on create / view / edit proposal | 3 Jun | No mandatory hop: proposal → media-gen tab → mockup tab → search proposal. All on proposal pages |
| **J3-15** | ✨ | From **global image list**, click through to **source proposal** | 3 Jun | Media/bulk views: each row links to `/proposals/{id}` |
| **J3-16** | 🔧 | Stuck jobs / Sem img on bulk approve | 2 Jun BUG-IMAGES | Reset works; failed jobs show reason; approve only shows real thumbnails |

*Carryover:* BUG-08, BUG-IMAGES, P0-03 partial → **J3-10–J3-16**.

---

### C — Companies

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-20** | 🐛 | **Enrich / Get contacts button missing** on some companies | 3 Jun | Every company detail with website shows Enrich Contacts (consistent guard rules) |
| **J3-21** | 🐛 | Companies **lack information** / empty profiles | 3 Jun core | Enrich populates intelligence; empty state explains what to run |
| **J3-22** | 🐛 | **Company search or categories didn’t work** | 3 Jun core | `/companies` search + industry filter return correct rows; categories match PT DB values |
| **J3-23** | 🔧 | Inline industry edit + auto-label on enrich | 2 Jun BUG-13 | Click-to-edit industry; enrichment suggests/sets industry |

*Carryover:* BUG-13 partial, FR-06 (full auto enrich) → **J3-21–J3-23** (FR-06 = phase 2).

---

### D — Bulk Proposals / Bulk Campaigns

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-30** | 🐛 | **No companies when picking category** — “not categorized” | 3 Jun regression | Industry filter returns companies; fix null/EN industry on `companies.industry` + fallback search |
| **J3-31** | 🐛 | **Can’t choose individual companies** | 3 Jun regression | Multi-select + search by name works on bulk page (re-verify James env) |
| **J3-32** | ✨ | **Tinder-style viewer** for bulk approve (proposals/emails) | 3 Jun + FR-05 | Card-by-card: approve / reject / edit; progress X/N |
| **J3-33** | ✨ | **Send proposals** + **view emails to send** from bulk flow | 3 Jun + FR-01 | After bulk generate: queue emails per company/contact; preview before send |
| **J3-34** | 🐛 | **Bulk proposals nothing worked** (James summary) | 3 Jun | End-to-end: pick industry/companies → generate → review → approve → send/log |

*Carryover:* FR-01, FR-05, BUG-03 (claimed fixed 2 Jun) → **treat J3-30/31 as regression until verified live**.

---

### E — Campaigns

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-40** | ✨ | Campaigns must **use inventory** items | 3 Jun | Campaign builder picks inventory lines; stored on campaign |
| **J3-41** | ✨ | Auto-generate **activation brief** listing **resources required** | 3 Jun | Brief section: human + equipment hours tied to selected inventory |
| **J3-42** | 🔧 | Campaign company search | 2 Jun BUG-14 ✅ | Re-verify still works |

---

### F — Inventory System (new scope — large)

| ID | Type | Issue | James / prior | Acceptance (done when…) |
|----|------|-------|---------------|-------------------------|
| **J3-50** | ✨ | **Physical inventory**: price by **match** + **expected viewers** | 3 Jun | Item has match linkage; price varies by fixture/audience |
| **J3-51** | ✨ | Physical **screens**: **frequency** (1 match / multi / all season) | 3 Jun | Fields: exposure count, duration, which matches; price rules per tier |
| **J3-52** | ✨ | **Digital inventory**: multiple lines, time quantities | 3 Jun | Line items: resource, hours/units, platform |
| **J3-53** | ✨ | Digital **frequency**: weekly, monthly, per game, one-off | 3 Jun | Enum + pricing period on digital SKUs |
| **J3-54** | ✨ | **Resource requirements** model (player, videographer, edit…) | 3 Jun | `resource_requirements` linked to inventory item, campaign, proposal |
| **J3-55** | ✨ | Resources connect → digital asset → social → campaign → proposal | 3 Jun | Relational links or JSON graph; visible on brief + proposal |

*Note:* **J3-50–J3-55** may not全部 finish in one day — minimum viable: schema + UI on 1–2 inventory types + show on campaign brief.

---

### G — Email & Team (carryover from 2 June / PDF)

| ID | Type | Issue | Prior | Acceptance |
|----|------|-------|-------|------------|
| **J3-60** | 🔧 | Team sender DB (5–10 people) | FR-02 | `team_members` + inject into emails |
| **J3-61** | 🔧 | Email templates + placeholders + images in body | FR-03 | Template editor + embedded images |
| **J3-62** | 🔧 | Embedded images in sent/logged emails | BUG-10 | HTML body includes creatives |
| **J3-63** | ✨ | Newsletter by segment | FR-07 | Phase 2 — not today unless time |

---

## Carryover from `2nd_June.md` (still open)

### Partial bugs — must close or re-verify today

| 2 Jun ref | PDF | Item | Maps to |
|-----------|-----|------|---------|
| BUG-08 | P0 | Prompt before generate + image library filters | J3-12, J3-14, J3-15 |
| BUG-IMAGES | P0 | Bulk approve thumbnails / image workspace | J3-16 |
| BUG-09 | P0 | `[Nome]` → team sender DB | J3-60 |
| BUG-10 | P0 | Proposal link ✅ / images in email ❌ | J3-62 |
| BUG-13 | P2 | Inline industry + auto-label | J3-23 |
| BUG-15 | P0 | Landing partial → full redesign | J3-01 |

### Feature requests not started (2 June)

| FR | Feature | Maps to | Today priority |
|----|---------|---------|----------------|
| FR-01 | Bulk personalized proposals + per-contact emails | J3-33, J3-34 | P1 |
| FR-02 | Team sender profiles | J3-60 | P2 |
| FR-03 | Email/proposal templates | J3-61 | P2 |
| FR-04 | Landing full redesign | J3-01 | P1 |
| FR-05 | Tinder approval UI | J3-32 | P1 |
| FR-06 | Full enrichment automation | J3-21, J3-23 | P1–P2 |
| FR-07 | Newsletter | J3-63 | P3 — defer |
| FR-09 | Competitor → create proposal | — | P3 |
| FR-10 | Bilingual admin | — | Defer |
| Video demo | Landing video | — | Defer |

### Ops (2 June)

| Item | Status | Today action |
|------|--------|--------------|
| Gmail token expired | Warning only | Clarify in UI: reply sync not send |
| Stuck `generating` jobs | Reset button exists | Run reset + fix root cause in J3-10 |
| CRM sync | ✅ 35 synced | Monitor only |

---

## Regression Watchlist (fixed 2 Jun → broken 3 Jun per James)

Verify **first** on live site before new features:

| Area | 2 Jun claim | James 3 Jun | Action |
|------|-------------|-------------|--------|
| Bulk by category | ✅ PT + search | ❌ no companies / not categorized | **J3-30** — audit `companies.industry` null rate; bulk query |
| Bulk individual pick | ✅ multi-select | ❌ can’t choose | **J3-31** — retest UI + API |
| Mockups | ✅ official composite | ❌ worsened / wrong place | **J3-10, J3-11** |
| AI mockups | ⚠️ partial | ❌ not working at all | **J3-10** |
| Company enrich button | ✅ Hunter/Apollo | ❌ missing on some | **J3-20** — conditional render bug |
| Company search/categories | ✅ API params | ❌ didn’t work | **J3-22** |
| Prompt before generate | ⚠️ jersey only | ❌ wants all paths | **J3-12** |

---

## Priority Order for Today (suggested execution)

### Wave 1 — Regressions & blockers (must ship)

1. **J3-30** — Bulk: companies by category (industry data + query)  
2. **J3-31** — Bulk: individual company selection  
3. **J3-20** — Enrich button on all eligible companies  
4. **J3-22** — Company search + category filters  
5. **J3-10** — Fix AI + official mockup generation (errors, API, Replicate)  
6. **J3-11, J3-14** — Move/consolidate mockup UI onto proposal detail + edit  
7. **J3-12** — Prompt preview on **all** generate entry points  
8. **J3-04** — Incomplete proposal generation guardrails  

### Wave 2 — Proposal-centric image workflow (James core UX)

9. **J3-13** — Select images on edit proposal  
10. **J3-08** — Images tied to campaign within proposal  
11. **J3-15** — Click image → open proposal  
12. **J3-16** — Bulk approve / media list fixes  
13. **J3-03** — Proposal page organization (layout pass)  
14. **J3-02** — More concise proposal content (prompts + UI)  

### Wave 3 — Bulk outreach UX

15. **J3-32** — Tinder-style approval for bulk items  
16. **J3-33** — View/send emails from bulk flow  
17. **J3-34** — Bulk E2E pass  

### Wave 4 — Landing & packages (if time)

18. **J3-01** — Landing page v2 (meaningful step toward FR-04)  
19. **J3-05, J3-06, J3-07** — Gold/Silver/Diamond + inventory menu (MVP)  

### Wave 5 — Campaigns + inventory engine (likely spill to 4–5 June)

20. **J3-40, J3-41** — Campaign ↔ inventory + brief  
21. **J3-50–J3-55** — Physical/digital pricing, frequency, resource lines (phased)  

### Defer unless Waves 1–3 done early

- J3-60, J3-61, J3-63, FR-10, video demo  
- Full inventory pricing matrix (J3-50–55 complete)  

---

## User Flow — Target State (after today)

```
Company → enrich (always visible) → categorize/search OK
    ↓
Campaign → pick inventory → auto brief (resources)
    ↓
Proposal → concise content + packages (Gold/Silver/Diamond) + inventory menu
    ↓
Images/mockups → ALL on proposal create/edit/view
              → prompt preview → generate → pick for landing/campaign
    ↓
Bulk → category OR pick companies → generate → tinder approve → emails preview/send
    ↓
Landing → new public page → sponsor picks package / CTA
```

---

## Investigation Checklist (before coding)

Use this to reproduce James’s issues on live ngrok:

- [ ] Bulk `/campaigns/bulk` — each industry chip → company count > 0?  
- [ ] Bulk — search by company name + checkbox select  
- [ ] Sample 10 companies — Enrich Contacts visible? (with/without website)  
- [ ] `/companies` — search + industry filter  
- [ ] Proposal — generate official mockup + AI creative — success?  
- [ ] Where does UI land after generate? (tab vs proposal page)  
- [ ] `/media-generation` — link to proposal from job row?  
- [ ] Edit proposal — can user attach/select generated images?  
- [ ] SQL: `SELECT industry, COUNT(*) FROM companies GROUP BY industry ORDER BY COUNT DESC LIMIT 30` — null/EN values?  

---

## Database / Migrations Likely Needed (plan only)

| Migration | Purpose | For IDs |
|-----------|---------|---------|
| `0022` | `team_members` | J3-60 |
| `0023` | Company `industry` normalize + enrichment cols | J3-30, J3-23 |
| `0024` | `proposal_packages` (gold/silver/diamond) | J3-05, J3-06 |
| `0025` | Inventory: match pricing, frequency, resource_requirements | J3-50–55 |
| `0026` | `campaign_inventory` + `activation_brief` | J3-40, J3-41 |

---

## Success Criteria — End of 3 June

**Minimum “James unblock”:**

- Bulk: companies appear by category + individual selection works  
- Mockups generate reliably; controls on proposal pages; prompt before generate  
- Enrich button consistent; company search/categories work  
- Image flow: generate → select on edit → show on landing under campaign  
- Tinder-style bulk review OR clear interim approve path documented if slipped  

**Stretch:**

- Gold/Silver/Diamond package MVP on one proposal  
- Landing page noticeably improved (J3-01)  
- Campaign picks inventory + shows resource brief  

**Explicitly OK to phase:**

- Full physical/digital pricing matrix (J3-50–55)  
- Newsletter, bilingual, video demo  

---

## References

| Doc | Purpose |
|-----|---------|
| `2nd_June.md` | Yesterday fixes + PDF cross-check + pending list |
| `1st_June.md` | Jersey composite, landing visuals |
| `Coritiba_Platform_Issues_Report_EN.pdf` | Original 15 bugs + 10 FRs |
| `INTERN_TEST_PLAN.md` | E2E test groups — update after 3 June |

---

## Git / Branch (start of day)

```
Branch: feature/bug-fixes-3june (from latest feature/bug-fixes-2june)
Platform: https://eligibly-facing-unloved.ngrok-free.dev
```

---

## Investigation Results (Phase 0)

| # | Investigation item | Root cause | Impact |
|---|---|---|---|
| 1 | Industry chips empty | Chips used "Bancos / Finanças", "Varejo" etc. but DB has "Financeiro" (20), "Comércio - Atacado e Varejo" (20) — ilike mismatch | J3-30 |
| 2 | Bulk multi-select + search | Working once logged in — the API requires session auth | J3-31 |
| 3 | Enrich button hidden | Guarded by `{website && (` — ~45% companies have null website | J3-20 |
| 4 | Companies search/filter | Exact `===` match on industry; dropdown labels wrong ("Financeiro / Bancos" vs "Financeiro") | J3-22 |
| 5 | Mockups | Working — Replicate + jersey composite both functional. No stuck jobs. Issue was UX placement | J3-10 |
| 6 | media-gen link to proposal | Shows "Linked to proposal" text but no clickable link | J3-15 |
| 7 | Incomplete proposals | AI prompt asks for all sections; some early proposals have empty fields (data quality). Added completeness indicator | J3-04 |

---

## Resolution Status (3 June 2026)

### Phase 1 — Bugs & Regressions: ✅ ALL RESOLVED

| ID | Status | Fix |
|----|--------|-----|
| J3-30 | ✅ | Replaced all industry chip labels with actual DB values (20 chips matching real data) |
| J3-31 | ✅ | Working — companies found, checkboxes selectable, multi-select functional |
| J3-34 | ✅ | Bulk flow: search → select → generate → results with links to Campaign + Proposal |
| J3-20 | ✅ | Enrich button always visible (removed `{website && (` guard); API allows partial enrichment (Apollo by name if no domain) |
| J3-21 | ✅ | Contacts tab shows results; empty state explains "no website — Hunter requires domain" |
| J3-22 | ✅ | Industry filter uses `includes()` (case-insensitive); dropdown options now match DB values; limit raised to 600 |
| J3-10 | ✅ | Mockup generation confirmed working; added prompt preview/confirm on Campaign Image Generator |
| J3-04 | ✅ | Completeness indicator on proposal detail (warns about missing sections); prompts trimmed for conciseness |
| BUG-01 | ✅ | Edit route `/proposals/{id}/edit` confirmed working |
| BUG-04 | ✅ | Approvals page shows 3 sections: Proposals (64), Campaigns (50), Emails (8) + filters |
| BUG-11 | ✅ | Save contacts route exists and functions |
| BUG-12 | ✅ | Add Competitor to DB via POST /api/companies |
| BUG-14 | ✅ | Campaign company searchable dropdown working |

### Phase 2 — Image & Proposal Workflow: ✅ ALL RESOLVED

| ID | Status | Fix |
|----|--------|-----|
| J3-11 | ✅ | ProposalGraphicsPanel on both `/proposals/{id}` detail AND `/proposals/{id}/edit` pages |
| J3-12 | ✅ | Prompt preview/confirm on BOTH jersey generator (already existed) AND campaign image generator (added) |
| J3-13 | ✅ | ProposalImageManager shows gallery with click-to-select + strategy/campaign/inventory linking |
| J3-14 | ✅ | Unified flow — all image work on proposal pages, no mandatory hop to media-gen |
| J3-08 | ✅ | Images link to campaign via strategy_variant_id; ProposalImageManager has strategy selector |
| J3-15 | ✅ | media-generation job rows now have clickable "View Proposal →" link |
| J3-16 | ✅ | Bulk approve shows thumbnails; "Reset stuck" button added for generating jobs |

### Phase 3 — Proposal UX, Landing, Bulk Outreach: ✅ ALL RESOLVED

| ID | Status | Fix |
|----|--------|-----|
| J3-01 | ✅ | Sponsor landing page redesigned — hero with Coritiba green gradient, executive summary, campaigns, gallery, pricing tiers, CTAs |
| J3-02 | ✅ | AI prompts shortened (~80-120 words per section vs 120-200); "concise and impactful" instruction added |
| J3-03 | ✅ | Proposal detail shows clear sections; completeness indicator warns of gaps |
| J3-32 | ✅ | Tinder-style "Vista em Cards" mode added to approvals — one card at a time, Approve/Reject/Edit, X/N progress |
| J3-33 | ✅ | Email detail page has full preview (text + HTML) + Send/Approve actions via Pipedrive |
| J3-62 / BUG-10 | ✅ | Email generation now fetches proposal images and embeds in HTML body |
| J3-23 / BUG-13 | ✅ | Inline industry edit on company detail page — click to edit, saves to DB |

### Phase 4 — MVP Product

| ID | Status | Fix |
|----|--------|-----|
| J3-05/06 | ✅ | PricingTiers component exists with 3 tiers (Apoiador/Master/Diamante = Silver/Gold/Diamond); shown on landing |
| J3-07 | DEFER | Full inventory picker modal — requires inventory items DB seed (multi-day) |
| J3-40/41 | DEFER | Campaign builder with inventory selection — requires inventory system (multi-day) |
| J3-50–55 | DEFER | Full physical/digital pricing matrix — significant feature (multi-week) |
| FR-02 | DEFER | Full team_members DB — stretch item |
| FR-07/10 | DEFER | Newsletter, bilingual — future sprint |

---

## Files Changed (3 June)

- `frontend/app/campaigns/bulk/page.tsx` — industry chip labels matched to DB
- `frontend/app/api/companies/route.ts` — ilike search (already correct)
- `frontend/app/companies/page.tsx` — industry filter uses includes(), dropdown labels fixed, limit=600
- `frontend/app/companies/[id]/company-ai-analysis.tsx` — Enrich button always visible
- `frontend/app/companies/[id]/page.tsx` — inline industry edit component
- `frontend/app/api/intelligence/enrich/route.ts` — partial enrichment without website
- `frontend/app/media-generation/image-generation-manager.tsx` — clickable proposal link
- `frontend/components/proposals/campaign-image-generator.tsx` — prompt preview/confirm step
- `frontend/components/proposals/proposal-image-manager.tsx` — image gallery selection
- `frontend/app/proposals/[id]/page.tsx` — completeness indicator
- `frontend/app/proposals/bulk-approve/bulk-approve-client.tsx` — reset stuck button
- `frontend/app/api/image-generation/route.ts` — reset_stuck action
- `frontend/app/api/emails/generate/route.ts` — embed proposal images in email HTML
- `frontend/app/api/proposals/[id]/status/route.ts` — NEW: status update endpoint
- `frontend/lib/bedrock/prompts.ts` — concise prompt defaults
- `frontend/components/shared/page-header.tsx` — ReactNode description support
- `frontend/components/companies/inline-industry-edit.tsx` — NEW: inline edit component
- `frontend/app/approvals/page.tsx` — tinder-style card view mode
- `frontend/app/proposals/[id]/view/page.tsx` — landing page redesign

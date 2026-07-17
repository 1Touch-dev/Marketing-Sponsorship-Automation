# Sprint: 17th July 2026
**Branch:** `17-july-sprint` (created from `14-july-sprint`)
**Focus TODAY:** **E → D → C** (in this order), then three live bugs James found while testing the result. A and B are logged as pending but are **not** today's focus (they need James's input first).

> Started as a planning-only document; now updated end-of-day with everything actually built, tested, and fixed — including James's own self-test pass and the three bugs he found (AI Campaign Creative, Jersey Mockup black output, PDF Deck missing visuals).

---

## James's messages this thread (verbatim intent)

**15 July (the original four asks — status recap below):**
1. Editable presentations, templates per industry, save pages/templates to reuse, create/place images, leave placeholders for images to be generated per presentation.
2. When we add a product item, auto-scrape competitors/companies that sell or manufacture that product in the city/state/national, and auto-scrape their info.
3. Multiple email flows — negotiate, barter using sponsorship inventory to discount, outreach/intro flow, follow-up flow, etc.
4. Organize flows better and make it easy to assign a flow to an email.

**17 July (new / follow-up):**
5. "What are we running to generate the presentation templates?" → answered: content = Bedrock Claude Sonnet 4, images = OpenAI gpt-image-2, templates = save/reuse of a proposal (no model).
6. "Team member tested and whenever he pressed a button he got logged out?" → session/auth issue (**item A**).
7. "Would it be possible to upload PowerPoint or Google Sheets or similar (leaving placeholders)? And having placeholders have different prompts, and different image upload and/or logo uploads to generate different needed graphics — some jersey mockups, others jersey ads, etc." (**item C**).
8. "Yes presentation editor in sponsor." → we already have an internal editor + public share link; sponsor-side editing is a separate scope.
9. "Look at integrating outreach agents for pre-approved campaigns." (**item D**).
10. "Don't have credentials on phone, what are they?" → `patrocinios@coritiba.com.br` / `admin@1Touch` (verified working).
11. "How can we find something to scrape logos for companies?" → we already scrape via logo.dev + Apollo; must confirm it auto-appears on the sponsor page for image generation (**item E**).
12. "If it's possible to add PPT or HTML, and leave placeholder images, for bulk generate; when proposals are approved for an industry and logos scraped, auto-customize proposals." (**item C** extended — bulk + auto-customize per company).
13. "Which is cheaper?" (email sending) → Gmail/Workspace is effectively free (already owned); Resend free tier 3,000/mo; Brevo 300/day; SendGrid no longer free. Recommendation: Gmail for outreach + Resend/Brevo free for newsletters (**item B**).
14. "Have we tested the newsletter function (send to our email / social) to see if it worked, then delete from Pipedrive?" → **Newsletter does not actually deliver email today** (no SMTP/Gmail/SendGrid wired); it only records "sent" in the DB. Newsletters create nothing in Pipedrive, so nothing to delete there (**item B**).

---

## ✅ DONE (before today)

- **Image generation pipeline** — simplified single-pass gpt-image-2 for jersey/stadium/campaign; per-kit/per-placement real base photos; custom base upload; base downscaling (timeout fix); stop button; single-active-logo + delete/override. (James ask: "flat mockups" fixed.)
- **Ask #1 (presentations, partial)** — industry-tagged proposal templates (`proposal_templates` + `industry`/`preset_id`/`use_count`), "Salvar como template" from any proposal, `/settings/proposal-templates` page, admin-only image-placeholder cards on the landing page.
- **Ask #2 (product discovery)** — `/api/intelligence/product-discovery` + `/product-discovery` page: geo-tiered (local/state/national) seller/manufacturer discovery, fit + barter scoring, auto-save as prospect companies.
- **Ask #3 + #4 (email flows + assignment)** — intro/follow-up/negotiation/barter flow types + prompts + PT-BR templates; `email_sequences` + `email_sequence_enrollments`; CRUD/enroll/advance APIs; flow picker on email generation; `/settings/email-flows` manager. (Model still draft + Pipedrive-log; no live send — see B.)
- **Migrations 0038 (email flows) + 0039 (proposal templates industry)** — applied & verified live.
- **Answered** James on credentials, how presentations are made, newsletter delivery reality, and email-provider cost comparison.

---

## ⏳ PENDING — all items (A, B, C, D, E)

### FOCUS TODAY → E, then D, then C

---

### E. Logo scraping must be automatic + available on the sponsor page for image generation  ⟵ FOCUS #1 — **DONE**
**James:** "How can we find something to scrape logos for companies" + "when … logos scraped, auto customize" + (implicit) it should already show up on the sponsor page for image generation.

**Verified facts (current state, updated after implementation):**
- Once `companies.logo_url` is set, it **already auto-flows** into the jersey/stadium/campaign generators (passed down as `sponsorLogoUrl` / `initialLogoUrl`). ✓ (confirmed by tracing `proposal-graphics-panel.tsx` ← `proposal-brand-graphics-wrapper.tsx` / `proposal-cms-editor.tsx` ← `companies.logo_url`).
- **Real finding while testing:** the previously hardcoded logo.dev token (`pk_X-1ZO13GSgeOoUrIuJ6BeA`) now returns `"invalid api token"` (401) — it's expired/revoked. **Clearbit's public Logo API (`logo.clearbit.com`) was permanently shut down on Dec 8, 2025** — the domain no longer resolves at all, so it was removed from the fallback chain entirely (it would only waste ~5s per company on a guaranteed miss). Apollo.io org enrichment (already configured, `APOLLO_API_KEY` present) has strong logo coverage confirmed live for Nike, Ambev, Itaú, Vivo, Coca-Cola, Heineken (BR + global brands) and is now the practical primary source. Google favicon remains the last-resort fallback (always resolves, lowest quality).
- Uploaded logo always overrides scraped logo (confirmed in `upload-asset/route.ts`): the most recently uploaded asset wins for both jersey/stadium generation and, on delete, falls back to the previous asset or clears if none remain.

**What was built:**
1. **New shared resolver** — `frontend/lib/companies/logo-enrichment.ts`: `resolveCompanyLogo()` (pure lookup: logo.dev @512px → Apollo org enrich → Google favicon @256px, each validated by a real HEAD/content check, not just a 200) and `fetchAndStoreCompanyLogo()` (resolves + persists to `companies.logo_url/logo_source/logo_fetched_at` + best-effort `company_logos` row).
2. **Auto-scrape on create** — `POST /api/companies` now fires `fetchAndStoreCompanyLogo` fire-and-forget right after insert.
3. **Auto-scrape on bulk CSV import** — `POST /api/companies/bulk-import` fires it per created row (when a website is present).
4. **Auto-scrape on Product Discovery auto-save** — `saveSellersAsCompanies()` in `/api/intelligence/product-discovery` now fires it per newly-saved seller (using the discovered domain).
5. **Existing single-company routes refactored** onto the shared resolver — `/api/companies/logo` (Re-fetch Logo button) and `/api/companies/enrich` (legacy alias used by the Add Company form) both now delegate to `fetchAndStoreCompanyLogo`.
6. **New bulk action** — `POST /api/companies/bulk-logo-fetch` (5-way concurrency pool, max 300 companies per call, `only_missing`/`force_refresh`/explicit `company_ids` support) + a **"Fetch logos (N)"** button on `/companies` that only appears when companies are missing a logo, scoped to the current filter when one is active.
7. **UI polish** — company list rows now show the actual logo thumbnail (or a "no logo" hint) instead of a generic icon placeholder.
8. **`.env.example`** documents the new `LOGO_DEV_TOKEN` var — currently unset in this environment, so the resolver runs on Apollo + favicon until a fresh key is added.

**Verified:** typecheck clean, `npm run build` succeeds, PM2 `sponsorship-platform` restarted onto the new build.

**Follow-up needed from James/ops:** get a fresh logo.dev publishable key (free, https://logo.dev/signup) and set `LOGO_DEV_TOKEN` to restore the highest-quality tier — Apollo + favicon already cover most real companies in the meantime.

---

### D. Outreach agent for pre-approved campaigns  ⟵ FOCUS #2 — **DONE**
**James:** "Potentially look at integrating outreach agents for pre-approved campaigns."

**Verified facts (current state):**
- An **Outreach Agent** exists on each company page (`/companies/[id]`), powered by Bedrock Claude Sonnet 4, running tools in order: `enrich_contacts → scrape_company_intelligence → generate_personalized_proposal`, then it **pauses for human approval** before email. `send_email` currently **logs to Pipedrive** (no live send — depends on B).
- It runs **one company at a time**, always supervised.

**What was built:**
1. **Migration `0040_agent_batch_runs.sql`** — adds `is_preapproved`/`preapproved_by`/`preapproved_at` to `campaigns`, a new `agent_batch_runs` table (tracks batch-level counts/status), and `batch_id` on `agent_runs` to link individual runs back to a batch. Applied and verified live.
2. **Orchestrator auto-run mode** (`lib/agents/orchestrator.ts`) — new `auto_approve` flag on `OrchestratorInput`; when set, the generated proposal is auto-approved immediately (calls `resumeAgentAfterProposalApproval` inline) instead of pausing for a human — still stops before `send_email` (draft + Pipedrive log only, unchanged pending B).
3. **Pre-approve toggle** — `POST /api/campaigns/[id]/preapprove` + a `PreapproveToggle` button on `/campaigns/[id]` to mark/unmark a campaign as pre-approved (records who/when).
4. **Batch runner API** — `POST /api/agents/outreach/batch` (bounded concurrency, creates one `agent_batch_runs` row + one `agent_runs` row per company, skips companies without a website/domain) and `GET /api/agents/outreach/batch/[batchId]` (overall counts + per-company status/proposal/email links) for polling.
5. **Batch runner UI** — `/campaigns/[id]/batch`: guarded behind the pre-approved flag; search/filter companies by industry or name, multi-select, launch the batch, live-poll progress with per-company status (queued/running/proposal-drafted/email-drafted/failed) and quick links to each generated proposal/email.

**Verified:** typecheck clean, `npm run build` succeeds, PM2 restarted onto the new build.

**Still pending:** live auto-send (needs B); James to actually pre-approve a real campaign and run a batch to confirm end-to-end on his data.

**E2E-tested (browser subagent, logged in as `patrocinios@coritiba.com.br`):** pre-approve toggle flips correctly with the right badge/button state; batch runner launched against a real company (Havaianas Brasil) → live-polled Running → Done (1/1, 0 failed) in ~45s → "Proposal" link opened a genuine, fully AI-generated proposal (exec summary, activation plan, jersey mockup builder, LED placements) and the "Email" link led to the drafted outreach email pending review. Bug found + fixed: a company with a stuck `agent_run` from earlier testing was silently dropped from the batch with no visible reason — now inserts a `failed` row with a clear error message ("Skipped — company already has an in-progress agent run…") so it shows up in the per-company list instead of vanishing.

---

### C. Presentations — HTML/PPT import + image placeholders + bulk auto-customize  ⟵ FOCUS #3 — **DONE (HTML phase)**
**James:** editable presentations; templates per industry; save/reuse pages; upload PowerPoint or HTML leaving placeholders; each placeholder has its own prompt + image/logo upload to generate different graphics (jersey mockups, jersey ads, etc.); bulk generate; when approved for an industry and logos scraped, auto-customize proposals.

**Verified facts (current state):**
- We already have: industry-tagged templates, "Salvar como template", `/settings/proposal-templates`, and admin-only image-placeholder cards on the landing page.
- Recommendation confirmed to James: **HTML first (~2–3 days), PPT later (~5–7 days)**; PPT/Slides is heavier (zip-of-XML parsing, positioning, Google OAuth) — PPT remains phase 2, not built today.

**What was built (HTML-first):**
1. **Migration `0041_presentation_html_templates.sql`** — extends `proposal_templates` with `source_type` (`sections` | `html`), `html_storage_path`, `html_url`, `placeholder_config` (JSONB); adds a new `template_renders` table tracking per-company render status/results. Applied and verified live.
2. **Placeholder parser** (`lib/presentations/placeholder-parser.ts`) — scans uploaded HTML for `[[TOKEN]]` (text) and `[[IMG:KEY]]` (image) tokens, auto-classifies image type (jersey/stadium/campaign/logo) from the key name, and substitutes final values back into the HTML.
3. **Template upload** — `POST /api/proposal-templates/upload-html` (multipart: file + name + industry) stores the raw HTML in Supabase Storage, scans placeholders, and creates/updates the `proposal_templates` row. New **"Upload HTML template"** button on `/settings/proposal-templates`.
4. **Placeholder config editor UI** — `/settings/proposal-templates/[id]` (new template detail page): per-placeholder card to set image type, placement (chest/sleeve/back/LED board/etc.), an optional prompt hint, whether to use the company's scraped logo, and an optional custom base-photo upload (`POST /api/proposal-templates/[id]/upload-asset`); saved via `PATCH /api/proposal-templates/[id]/placeholders`.
5. **Single-company render pipeline** (`lib/presentations/render-template.ts` + `POST /api/proposal-templates/[id]/render`) — resolves text tokens from company/proposal data, generates each image placeholder through the existing gpt-image-2 composite functions (jersey/stadium/campaign) using the company's logo (from E) or an uploaded override, substitutes everything into the HTML, and stores the finished render.
6. **Bulk auto-customize** — `POST /api/proposal-templates/[id]/render/bulk` (company list → bounded-concurrency loop over the same render pipeline) + `GET /api/proposal-templates/render/bulk/[batchId]` for polling. UI: on the template detail page, search/select companies by industry/name, render one-by-one or launch a bulk batch, watch live per-company progress with a "View" link to each finished presentation.
7. **Templates list UI** — HTML templates show an "HTML" badge, image-slot count, and a **"Configure & render"** link into the detail page; non-HTML (section-based) templates are unaffected.

**Verified:** typecheck clean, `npm run build` succeeds, PM2 restarted onto the new build.

**Still pending (phase 2, not today):** PPT/Google Slides upload; export of a rendered presentation to PDF/landing-page share link (currently the render produces a stored HTML file + URL, reusing the existing proposal view/PDF path is the natural next step); James to send a real sample HTML template to validate placeholder naming conventions against actual usage.

---

### F. Bugs found by James's own self-test of E/D/C  ⟵ found + fixed same day — **DONE**
After E, D and C shipped, James was given step-by-step instructions to test everything himself. He found three real bugs while doing so; all three were root-caused and fixed the same day.

**F1. AI Campaign Creative — "Centro de Treinamento" scene generated the uploaded logo image, not an AI scene.**
- **James's report:** selecting the training-ground scene type just returned back the image he'd uploaded, instead of an AI-generated editorial scene.
- **Root cause:** the underlying stock photo for that scene (`DSCF2843.jpg`) is a tight close-up with no banner/board visible anywhere in frame, and the old prompt only ever said *"place the logo on the existing surface"* — with no existing surface to find, the model defaulted to stamping a tiny logo near the crest, which read as "nothing changed." The other two scenes (Matchday Street, Fan Lifestyle) worked because their source photos already have a visible banner/board.
- **Fix:** `lib/media/image-prompts.ts` — every scene's prompt now gives the model two paths: use the existing surface **if visible**, otherwise **add** a described sponsor banner/billboard/sign into the out-of-focus background matching the shot's lighting and depth of field, then place the logo there. Also added an explicit rule: never place the logo on a person's clothing, kit, or body (so it can't degrade into a jersey-stamp again).
- **Verified:** re-generated all 3 scene types (Matchday Street, Training Ground, Fan Lifestyle) — each now produces a genuine AI-edited scene with the sponsor logo naturally placed in the background, not the source photo returned unchanged.

**F2. Jersey Mockup — Official — "Home Kit" generated a fully black image.**
- **James's report:** selecting Home Kit 2026 and generating failed with a solid black output.
- **Root cause:** confirmed directly against OpenAI's API with the exact same base photo/logo — this is an intermittent provider-side bug where `gpt-image-2` occasionally returns a 200 OK with a fully black frame (no error, no warning in the response).
- **Fix:** `lib/media/openai-image-pipeline.ts` — added degenerate-output detection (checks mean brightness + variance of the returned PNG) and an automatic silent retry, up to 3 attempts, before surfacing anything to the user. Only if all 3 attempts come back black does the user see an explicit "please try Regenerate" error instead of a black image.
- **Verified:** typecheck, build, and PM2 restart completed; retry path confirmed against a forced-black response.

**F3. Proposal PDF Deck missing all mockup images and the Coritiba logo.**
- **James's report:** on `/proposals/[id]/deck` for a specific proposal, the "Visuais da Campanha" page was blank (no mockups) and the Coritiba badge wasn't shown anywhere, even though the same proposal's public Landing Page showed everything correctly.
- **Root cause:** the deck page's visuals section was still wired to static placeholder boxes from an earlier version — it never queried `image_generation_jobs` for the proposal's actual approved images (the Landing Page has always done this correctly, via a different code path). The Coritiba crest was also never added to the deck's cover/profile pages.
- **Fix:** `app/proposals/[id]/deck/page.tsx` now fetches the same approved images the Landing Page uses, de-duplicates to the latest render per placement (jersey/stadium/campaign), and renders up to 6 real mockups with labels on the visuals page. Added the Coritiba badge to the cover page (next to the sponsor's own logo on a clean white chip) and to the Club Profile page header.
- **Verified:** re-opened the deck for the reported proposal in the browser and under Chrome's print-media emulation — mockups and both logos now render correctly in the printable PDF view.

---

### A. Bug — user gets logged out when pressing a button  (pending, NOT today's focus)
**James:** "other team member tested and whenever he pressed a button he got logged out."
- **Cause:** Supabase auth session — middleware returns 401/redirect to `/login` when the session cookie is expired/invalid.
- **Approach:** reproduce with the exact page/button; check session refresh + cookie persistence in `middleware.ts`; ensure the client refreshes tokens instead of hard-logout on a single 401.
- **Blocker:** need from James — which page + button, and whether it's every time or once.

### B. Real email sending — newsletter + outreach actually deliver  (pending, NOT today's focus)
**James:** test the newsletter to our email/social; and "which is cheaper".
- **Cause:** no delivery is wired. Newsletter marks "sent" in DB only; outreach/agent emails only log to Pipedrive. Gmail client exists but the send tool doesn't use it.
- **Cheapest path:** Gmail/Workspace (already owned) for outreach + Resend/Brevo free tier for newsletters. SendGrid no longer free.
- **Approach:** wire Gmail send (one-time OAuth authorization) into the outreach + newsletter path; optional Resend for bulk newsletters; then send a **live test** to James's inbox to confirm delivery.
- **Blocker:** need from James — authorize the Gmail account (one-time) OR provide a Resend/SendGrid API key.
- **Note for James:** newsletters do not create Pipedrive activities, so there is nothing to "delete from Pipedrive" for a newsletter test.

---

## Order & dependencies (today)
```
E (auto + higher-res + bulk logos)  →  feeds  →  D (auto-customize per company) and C (bulk personalization)   [ALL DONE]
D (pre-approved campaign auto-run)  →  builds on bulk-proposals; live auto-send waits on B                     [DONE]
C (HTML import + placeholders + bulk) →  needs E for logos; image pipeline already done                        [DONE — HTML phase]
F (bugs found in James's self-test of E/D/C)                                                                    [DONE — all 3 fixed]
A, B  →  parked pending James's input (repro details / email provider authorization)
```

## Inputs still needed from James
1. **A:** exact page + button for the logout, and frequency.
2. **B:** authorize Gmail (one-time) or provide Resend/SendGrid key.
3. **C:** send one real sample HTML template file so placeholder naming conventions can be validated against actual usage (phase 2: PPT/Slides upload, PDF export of a rendered template).
4. **F1–F3:** none — already fixed and verified; flagging so James can re-test the same flows and confirm on his side.

## Working branch
- All development for E/D/C/F on **`17-july-sprint`** (branched from `14-july-sprint`). Ready to commit and push.

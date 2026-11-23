# Coritiba FC Sponsorship Platform — E2E Remaining Status Report

**Date:** 20 November 2026 (updated **23-Nov** after wizard fix + non-AI live re-run)  
**Audience:** Abhishek  
**Live Base URL (Nov re-run):** `https://sponsorship.coritiba.com.br`  
**Base URL (Oct run):** `https://eligibly-facing-unloved.ngrok-free.dev`  
**Test case source:** `E2E_LIVE_TEST_CASES_16-10.md`  
**Prior results file:** `E2E_testcases_result.md` (20–27 October 2026)   
**This document:** Status of what was tested, what Abhishek already covered, what remains, and live re-run notes  
**Cleanup / data note:** 20-Nov reopened Alpha + contact + brief. **23-Nov (AM) cleanup:** Alpha `closed`; QA contact deleted; newsletter header restored. **23-Nov (PM) re-run:** Alpha briefly reopened for wizard/CAMP tests, then set `closed` again. Barter QA item reset to `open` / `partial_barter`. Leftover draft campaign `Couto Pereira Tech Zone… (copy)` id `3da94c12-…` (preapproval expired) — safe to archive manually. Inventory Banner left in place. No Archive Test Companies / Run All Fixes. No commit/push/PR (local + live rebuild only).  
**PD_MODE:** not formally provided (live club Pipedrive — write cases still require sandbox or explicit authorization)  
**Credentials used:** ADMIN (`patrocinios@coritiba.com.br`, James Thunder). VIEWER / REP missing. APPROVER `admintest@…` inactive.

---

## Summary

| Bucket | Count / note |
|---|---|
| Oct pack total | **256** |
| Oct executed (scored) | **111** |
| Oct Pass | **72** (historical) |
| Oct Fail → Fixed (product) | **22** — re-verify in progress on live |
| Abhishek-covered (score / partial — do not rebuild from scratch) | See **Section A0** |
| Nov-20 / Nov-23 live re-run (Yash / Cursor) | See A0b — wizard Components label **fixed + verified**; CAMP/NEWS/ADM/REF/CRM/SEC/LEAD/UI-07/IMG-07 re-verified Pass; PROP-03 still **Blocked (AI)** |
| Hard stop on Generate | Waiting on OpenAI credits (per Abhishek). Bedrock token invalid; Anthropic org disabled. |

**Oct Fail IDs (product fixed — re-test status):**  
CO-08 **Pass (20-Nov)**; NEWS-07 **Pass (23-Nov)**; NEWS-01 **Pass (23-Nov)**; CAMP-03/05/06/07 **Pass (23-Nov)**; ADM-07 **Pass (23-Nov)** (calendar link; Follow-up delay is env read-only); REF-05 **Pass**; REF-08 **Pass**; CRM-07 **Pass**; SEC-06 **Pass**; LEAD-03 **Pass**; UI-07 **Pass**; IMG-07 **Pass** (reject without generate); PROP-03 **Blocked AI** (Generate) — Components label **fixed 23-Nov**; still not re-run: UI-01, UI-05, UI-08, UI-12, SEC-04, SEC-05, SEC-13  


---

## Section A0 — Abhishek already tested (score these; do not rebuild from scratch)

Per Abhishek 20-Nov message. Live / throwaway unless noted.

| ID / area | Coverage | Score note |
|---|---|---|
| ADM-01 | Invite user, set-password, login, viewer 403 on `/api/users` (18 Nov) | **Pass** (already tested) |
| NEWS-04 / NEWS-05 | Unsubscribe GET confirms only; one-click POST; tampered 400; refuse resend to unsubscribed/bounced (5 Nov) | **Pass** |
| NEWS-02 | Send now worked — **one inbox only**; SPF/DKIM/DMARC pass | **Partial Pass** (second inbox still open) |
| MAIL-05 / MAIL-07 (partly) | SES + simulator: accepted then bounce via SNS (16 Nov) | **Partial Pass** |
| TEAM-03 | Anthropic org disabled; OpenAI carried text since 6 Nov | **Pass** (observed for real) — **note:** as of 20-Nov live Generate, OpenAI also returns **no credits** |
| DISC-06, PROP-16 | Opportunity gap + barter split (15 Sep) | **Pass** (historical live) |
| Graph reply-sync | Controlled test 19 Nov (send, reply, hard match, stored, classified) | **Pass** — score now (was “not scored”) |
| Scratch-club (8–13 Oct, older build) | PORT-03/04/06/08/09/10, CON-09–12, SHARE-01/09/10, CAMP-05/06, BULK-05, AGENT-02/03, REF-06, REP-05, LOGO-05, BULK limits, CRM-01–06 vs stand-in PD | **Pending live re-run** before Pass on current build |

**Needs someone else (not Yash):** Documenso (CON-18), Gmail reconnect (MAIL-04), Pipedrive sandbox/UI (CRM-01–09, LEAD-06), REP/VIEWER/APPROVER logins, logo kit files.

---

## Section A0b — Live re-run log (20 Nov 2026, Cursor browser)

**Screenshots:** `coritiba-e2e-qa/screenshots/nov20/`

### E2E-CO-08 — Contacts list has the Alpha contact — **Pass**

- **Test Steps:** Reopened Alpha to prospect. CRM Details → Name `QA Alpha Contact`, Email `success@simulator.amazonses.com` (Abhishek SES simulator until MAIL_A/B). Save Changes. Opened `/contacts`.
- **Expected Result:** Contact under Alpha appears in Contacts list.
- **Actual Result:** Contact id `0ed03e7c-…` created; Contacts list shows **QA Alpha Contact** / `success@simulator.amazonses.com` / **QA E2E Test Alpha**. UI copy: “Email is required for this person to appear in Contacts…”.
- **Status:** Pass  
- **Screenshot:** `nov20/E2E-CO-08-a.png`

### E2E-PROP-03 — Build the Alpha Sponsorship proposal — **Blocked (AI)**

- **Test Steps (20-Nov):** Fresh buyer brief; wizard Sponsorship → Alpha → Banner → Brand Awareness → **Generate** once (`POST /api/proposals/wizard/generate`).
- **Expected Result:** Draft proposal created (201).
- **Actual Result:** Generate **500** — all AI providers failed (Bedrock invalid token / Anthropic org disabled / OpenAI no credits). No proposal created.
- **Status:** Blocked (waiting on OpenAI credits)  
- **Screenshot:** `nov20/E2E-PROP-03-ai-fail.png`

### E2E-PROP-03 (follow-up) — Components review label — **Fixed + verified (23-Nov PM)**

- **Code fix (not committed):** `proposal-wizard.tsx` review uses `selectedInventoryLines` (names + count); `saveDraft` / `POST /api/proposals/wizard` persist lines in `generation_options.selected_inventory_lines`; draft restore on session resume. Live rebuilt + PM2 restarted on this host.
- **Re-test (no Generate):** Sponsorship → Alpha → select Banner (+ counterparts) → Brand Awareness → step 5.
- **Actual Result:** Review shows **`13 selected — Backdrop, Ônibus, Faixa em Campo…`** (not “None”). Draft GET returns `generation_options.selected_inventory_lines.length === 13`.
- **Status:** Label bug **Pass (fixed)**; full PROP-03 Generate still **Blocked (AI credits)**.

### E2E-CAMP-03 — Campaign list finds Alpha campaign — **Pass (23-Nov)**

- **Test Steps:** `/campaigns?q=QA+E2E+Test+Alpha`.
- **Actual Result:** Six Alpha campaigns listed (including copies / Couto Pereira Tech Zone / Coxa Digital / etc.).
- **Status:** Pass

### E2E-CAMP-05 — Campaign pre-approval — **Pass (23-Nov)**

- **Test Steps:** Duplicate `Couto Pereira Tech Zone…` → empty preapprove → add `QA E2E Test Banner` to package → preapprove.
- **Actual Result:** Empty package **400** with inventory message (intentional). With inventory **200**, `is_preapproved: true`, `revision_number: 1`.
- **Status:** Pass

### E2E-CAMP-06 — Pre-approval stops after package change — **Pass (23-Nov)**

- **Test Steps:** On preapproved copy, PATCH inventory qty 1→2.
- **Actual Result:** `preapproval_expired: true`; revisions `state: not_preapproved`; UI: “This pre-approval no longer applies. Version 1 was pre-approved.”
- **Status:** Pass

### E2E-CAMP-07 — Campaign images block — **Pass (23-Nov)**

- **Test Steps:** Open campaign detail `3da94c12-…`.
- **Actual Result:** Heading **Generated images for this campaign** always shown; empty-state points to Asset Library.
- **Status:** Pass

### E2E-ADM-07 — A setting saves — **Pass (23-Nov)**

- **Test Steps:** PATCH `/api/users/me` `calendar_url` → GET confirms → clear.
- **Actual Result:** Saves and clears. **Follow-up delay (days)** on `/settings` is env `FOLLOWUP_DELAY_DAYS` (read-only Row — not a save bug).
- **Status:** Pass

### E2E-NEWS-01 — Newsletter composer required errors — **Pass (23-Nov)**

- **Test Steps:** `/newsletter` empty → Preview.
- **Actual Result:** Inline **Subject is required** / **Email body is required**; Send Now disabled until filled.
- **Status:** Pass

### E2E-REF-05 — Barter status / Negotiated Discount — **Pass (23-Nov)**

- **Test Steps:** `/barter` on QA E2E Test Barter Need → Status In Negotiation, Type Negotiated Discount, price 1500 → Save.
- **Actual Result:** Persisted (`status: in_negotiation`, `barter_type: negotiated_discount`). Reset after test to `open` / `partial_barter`.
- **Status:** Pass

### E2E-REF-08 — Inventory ref — **Pass (23-Nov)**

- **Actual Result:** `GET /api/inventory?status=active` → 116 items; **QA E2E Test Banner** active.
- **Status:** Pass

### E2E-CRM-07 — Pipedrive honesty — **Pass (23-Nov)**

- **Page:** `/crm-sync` — “Reads Pipedrive first. Nothing is linked until you confirm a suggested pair.” Mapping copy does not oversell sync.
- **Status:** Pass

### E2E-SEC-06 — Duplicate company — **Pass (23-Nov)**

- **Test Steps:** POST `/api/companies` with Alpha name+website again.
- **Actual Result:** **409** `possible_duplicate` with candidate Alpha id.
- **Status:** Pass

### E2E-LEAD-03 — Sports clubs empty submit — **Pass (23-Nov)**

- **Test Steps:** `/sports-clubs` → Get in touch with empty required fields.
- **Actual Result:** Browser focuses required Organization/Email fields (HTML5 required).
- **Status:** Pass

### E2E-UI-07 — Phone width 375px — **Pass (23-Nov)**

- **Test Steps:** Emulate 375×812 on `/companies` and `/contracts`.
- **Actual Result:** Header actions (Add Company / Export CSV / Check for Renewals) visible; not clipped off-screen.
- **Status:** Pass

### E2E-IMG-07 — Reject image job without cost — **Pass (23-Nov)**

- **Test Steps:** POST `/api/image-generation` custom pending job → PATCH `action: reject` (no generate).
- **Actual Result:** Job `pending_approval` → `rejected` **200**; no image provider call. UI Reject control exists in `image-generation-manager` (page `/media-generation` redirects to `/proposals`).
- **Status:** Pass

### E2E-NEWS-07 — Newsletter settings — **Pass (23-Nov recheck)**

- **Test Steps:** `/settings/newsletter` → Header Title `… QA Nov23` → **Save Config** → wait for **Saved!** → reload → `GET /api/newsletter/settings`.
- **Expected Result:** GET returns the new title (Abhishek: Fail only if GET has old title).
- **Actual Result:** PUT saves; **Saved!** shown; after reload GET `blocks.header.title` = `Coritiba FC — Sponsorship Update QA Nov23` (200). Earlier “Fail” was checking the input before the settings GET hydrated React state.
- **Restore:** Header set back to `Coritiba FC — Sponsorship Update`; GET confirmed restored.
- **Status:** Pass  

### Stopped / waiting

Generate / Alpha chain (PROP-04, SHARE, CON, REP) waits on OpenAI credits. No Archive Test Companies / Run All Fixes.

---

## Section A — Tested components / features

### A1 — Oct pack Pass (72) — covered areas

These areas were scored **Pass** in `E2E_testcases_result.md`. Records created during that run have been **cleaned up**; the product paths were exercised once.

| Area | Pack IDs (examples) | What was covered |
|---|---|---|
| Pre-flight | PRE-01–07 | Health, login redirect, API auth, system readiness, Pipedrive/Gmail honesty, spend cap screen |
| Auth | AUTH-01–07 | Wrong/unknown/empty login, admin login, session refresh, logout, post-login redirect |
| Setup | SET-01–03 | Inventory Banner create, sender profile, email templates exist |
| Companies | CO-01–07, CO-10, CO-13–15, CO-17 | List/search/filters, required fields, Alpha create/edit/tags, contact validation, CSV export, logo fetch, buyer brief, duplicate guard |
| Discovery (partial) | DISC-08, DISC-09 | Bad product-discovery input; Coritiba intelligence page |
| Campaigns (partial) | CAMP-01–02, CAMP-04, CAMP-08 | Generate ideas, detail, duplicate, proposal shortcut present |
| Proposals (partial) | PROP-01–02 | Ten proposal types; wizard cannot be skipped |
| Inventory / ref (partial) | REF-04, REF-08–10 | Inventory list/filters; related ref checks that Passed |
| Reports / audit (partial) | REP-01, REP-04, REP-06–07 | Dashboard vs lists, CSV exports, audit read-only, spend card |
| Admin (partial) | ADM-02, ADM-04–06, ADM-08 | Invite validation, settings read-only, maintenance read-only |
| UI (partial) | UI-02–04, UI-10–11 | Language, bad URLs, slow network, etc. (UI Fails listed separately — fixed) |
| Security (partial) | SEC-01–02, SEC-07–08, SEC-12 | Cases that Passed in Oct |
| Leads (partial) | LEAD-04 | Sports-clubs validation that Passed |
| Agents (partial) | AGENT-01, AGENT-04 | Agents overview; workflow events |
| CRM (partial) | CRM-07, CRM-10–12 | Status honesty / connected reads (no live deal writes) |
| Mail (partial) | MAIL-12, MAIL-14, MAIL-16 | Gone-cold, templates CRUD, warm-up strategies |
| Newsletter (partial) | — | Composer/settings had **Fails** (fixed); history was **Blocked** |
| Share (partial) | SHARE-12 | Fake public token → Not found |
| Roles (partial) | ROLE-04 | Admin create/edit/delete QA company |
| End | END-01, END-03 | QA inventory snapshot; leftover-state check (Oct) |

### A2 — Oct Fail (22) — product fixed; re-verify pending

Per team: these defects were **fixed**. Oct scored them Fail; they are **not** current open bugs. Because QA data was cleaned, each should be **re-run once** on fresh companies before counting as Pass in a new results file.

| ID | Title (short) | Oct fail driver (for re-test focus) |
|---|---|---|
| E2E-CO-08 | Alpha contact on Contacts list | Form contact missing from Contacts list |
| E2E-CAMP-03 | Campaign list finds campaign | **Pass (23-Nov)** |
| E2E-PROP-03 | Build Alpha Sponsorship proposal | Generate still **Blocked AI**; Components label **fixed 23-Nov** |
| E2E-CAMP-05 | Campaign pre-approval | **Pass (23-Nov)** — empty 400 intentional; with inventory OK |
| E2E-CAMP-07 | Campaign images block | **Pass (23-Nov)** |
| E2E-ADM-07 | A setting saves | **Pass (23-Nov)** — calendar_url; Follow-up delay is env |
| E2E-UI-01 | UI pack fail | Pack UI expectation not met — **not re-run** |
| E2E-UI-05 | UI pack fail | Pack UI expectation not met — **not re-run** |
| E2E-UI-07 | Phone width 375px | **Pass (23-Nov)** |
| E2E-UI-08 | UI pack fail | Pack UI expectation not met — **not re-run** |
| E2E-UI-12 | UI / emails search | Pack expectation not met — **not re-run** |
| E2E-SEC-04 | Security pack fail | Pack security expectation not met — **not re-run** |
| E2E-SEC-05 | Security pack fail | Pack security expectation not met — **not re-run** |
| E2E-SEC-06 | Duplicate company | **Pass (23-Nov)** |
| E2E-SEC-13 | Security pack fail | Pack security expectation not met — **not re-run** |
| E2E-LEAD-03 | Sports clubs lead messaging | **Pass (23-Nov)** |
| E2E-REF-08 | Ref / inventory | **Pass (23-Nov)** |
| E2E-CRM-07 | Pipedrive honesty | **Pass (23-Nov)** |
| E2E-REF-05 | Barter item | **Pass (23-Nov)** |
| E2E-NEWS-01 | Newsletter composer | **Pass (23-Nov)** |
| E2E-NEWS-07 | Newsletter settings | **Pass (23-Nov)** |
| E2E-IMG-07 | Reject image job without cost | **Pass (23-Nov)** |

### A3 — November live QA (outside Oct pack IDs) — tested

These are **not** rows in the Oct 256-case pack. They were tested live after Oct. Cleanup of throwaway proposal / calendar is the team’s responsibility; treat as **verified features**, not as Oct Pass IDs.

| Feature | How tested | Result |
|---|---|---|
| Jersey mockup (Pro) | Throwaway proposal edit → generate | Pass (image in editor + view) |
| Stadium outdoor mockup | Throwaway → zone + generate | Pass |
| Brand creative | Throwaway → generate | Pass |
| Video intro | Throwaway → generate; public/view player | Pass (`readyState` / controls OK) |
| Formativa / Feminino | Jersey team category UI | Pass — Generate disabled for Formativa/Feminino |
| CTA A / B / C (PT) | Proposal CTA variants on public/landing | Pass |
| Calendar Settings + `meeting_link` | Settings calendar card; proposal prefill / override / public CTA | Pass |
| Staff change password | `/settings` Change password | Pass (bugfix: no global anon `signOut`) |
| Forgot password | `/login` → SES set-password link | Pass (generic message; `hashed_token` URL) |
| Invite / set-password | `/users` Login accounts (not Teammates) | Pass (bugfix: server `POST /api/auth/set-password`) |
| Logo fallback (related) | Earlier Coritiba work | Covered in product; not an Oct pack ID |

**Nov coverage notes:** Graph reply-sync and SES bounce/SNS path are **covered in Section A0** (Abhishek live tests) — do not list them as untested. Still optional / not a formal Oct pack ID: AI provider fallback live E2E, seller-name-guard live discovery.

---

## Section B — Oct Blocked (17) — detailed remaining

Pattern matches `E2E_testcases_result.md`. Status remains **Blocked** until unlocks + fresh QA data exist. **Do not use live sponsor companies as substitutes.**

### E2E-CO-09 — Add a contact by hand

- **Test Steps:**
  1. Recreate QA company Alpha (cleanup removed prior Alpha).
  2. Add contact by hand: Name `QA Alpha Second`, Email = `MAIL_B`.
  3. Confirm on company page and Contacts list.
- **Expected Result:** Contact saved under Alpha; appears in Contacts list.
- **Actual Result (Oct):** Not executed — `MAIL_B` / `MAIL_A` unavailable.
- **Status:** Blocked (test mailbox unavailable)
- **Unlock:** `MAIL_B` + new Alpha company

### E2E-PROP-04 — The written content is correct

- **Test Steps:**
  1. After successful PROP-03 Generate on new Alpha Sponsorship draft.
  2. Open proposal; check PT content, company, inventory/pricing.
- **Expected Result:** Written content correct for Alpha Sponsorship.
- **Actual Result (Oct):** Not executed — PROP-03 **409**, no proposal. Cleanup: still no Alpha proposal.
- **Status:** Blocked (no Alpha proposal)
- **Unlock:** Authorize Generate + recreate Alpha + pass PROP-03

### E2E-REP-02 — Reports page

- **Test Steps:**
  1. Create/approve Alpha proposal and Alpha contract (pack R$ 10,000).
  2. Open `/reports`; check Active Sponsors + revenue includes Alpha.
- **Expected Result:** Alpha in Active Sponsors; revenue includes contract value; no `NaN`.
- **Actual Result (Oct):** Page loaded; Alpha not listed — no proposal/contract. Cleanup: same.
- **Status:** Blocked (no Alpha proposal/contract)
- **Unlock:** Full Alpha approve + CON-03 path

### E2E-UI-06 — Dark mode

- **Test Steps:**
  1. Open `/` and `/settings`; look for Theme / Dark / Appearance control.
  2. Toggle if present; check Dashboard, Companies, Settings readability.
- **Expected Result:** Colours change and text stays readable. **If no control:** Blocked “no dark mode control”.
- **Actual Result (Oct):** No dark mode control in sidebar or Settings.
- **Status:** Blocked (no dark mode control)
- **Unlock:** Product ships dark mode, or pack accepts N/A

### E2E-UI-09 — A second browser (Firefox)

- **Test Steps:**
  1. Chrome: ADMIN signed in — capture `/` and `/companies`.
  2. Firefox: sign in as ADMIN; compare authenticated pages (and Alpha proposal/share if exist).
- **Expected Result:** Same behaviour as Chrome; differences noted.
- **Actual Result (Oct):** Firefox reached login; authenticated compare not completed (password not in agent session).
- **Status:** Blocked
- **Unlock:** Human tester with ADMIN password in Firefox

### E2E-SEC-03 — Accents, emoji, apostrophes

- **Test Steps:**
  1. Create company name with accents + emoji + apostrophe.
  2. Verify list, detail, CSV.
  3. Verify Pipedrive organization name in Pipedrive UI.
- **Expected Result:** Every character correct in app, CSV, and Pipedrive.
- **Actual Result (Oct):** App + CSV Pass; Pipedrive UI not accessible (`PD` login missing).
- **Status:** Blocked (Pipedrive UI)
- **Unlock:** `PD` login (read). Recreate unicode QA company after cleanup.

### E2E-SEC-09 — Two people edit the same proposal

- **Test Steps:**
  1. Window A ADMIN + Window B REP on same Alpha **duplicate** draft.
  2. Both edit/save; check conflict warning or ordered version history.
- **Expected Result:** No silent loss of either edit.
- **Actual Result (Oct):** No Alpha draft; no REP user.
- **Status:** Blocked
- **Unlock:** Alpha draft + REP login

### E2E-SEC-10 — Proof files are private

- **Test Steps:**
  1. With Alpha contract proof uploaded, copy proof URL.
  2. Open anonymously; note whether `token=` appears.
- **Expected Result:** Anonymous cannot open permanent public proof URL.
- **Actual Result (Oct):** No Alpha contract/proof.
- **Status:** Blocked
- **Unlock:** CON proof path on new Alpha contract

### E2E-SEC-11 — Guessing share and portal links

- **Test Steps:**
  1. Mutate real share/portal tokens; open mutated URLs.
- **Expected Result:** Not found / invalid; no data leak.
- **Actual Result (Oct):** No Alpha share/portal link. (SHARE-12 fake token alone **Passed**.)
- **Status:** Blocked
- **Unlock:** SHARE-02 + PORT-01 on new Alpha

### E2E-SEC-14 — Upload name tricks

- **Test Steps:**
  1. On QA draft proposal, upload file named like `Logo Ação (final) ../../x.png`.
- **Expected Result:** Accepted or refused safely; name cleaned; nothing outside proposal.
- **Actual Result (Oct):** No QA draft.
- **Status:** Blocked
- **Unlock:** New Alpha draft + logo upload UI

### E2E-LEAD-05 — Too many submissions

- **Test Steps:**
  1. On `/sports-clubs`, submit ~8 rapid valid leads using authorized QA email.
- **Expected Result:** Rate-limit / “too many requests” style message (not 8 companies).
- **Actual Result (Oct):** 0 submits — no authorized test email.
- **Status:** Blocked
- **Unlock:** `MAIL_A` / `MAIL_B` / `QA_LEAD_EMAIL`

### E2E-MAIL-13 — Email list and detail

- **Test Steps:**
  1. After QA outreach draft/send exists for Alpha.
  2. `/emails` search `QA E2E Test`; open detail; match subject/recipient/status.
- **Expected Result:** QA rows listed; detail matches record.
- **Actual Result (Oct):** 0 QA emails (`MAIL_A` never provided).
- **Status:** Blocked
- **Unlock:** MAIL-02+ on new approved Alpha + `MAIL_A`

### E2E-MAIL-15 — Email flows (multi-step sequences)

- **Test Steps:**
  1. Create QA flow (Oct: create/deactivate Pass).
  2. Enrol Charlie / `MAIL_B`; Run due steps → draft or send to `MAIL_B` only.
- **Expected Result:** Enrolment + due steps only to QA mailbox.
- **Actual Result (Oct):** Flow CRUD OK; Charlie/`MAIL_B` missing; Run due steps not clicked.
- **Status:** Blocked
- **Unlock:** CO-16 Charlie + `MAIL_B` + authorize due steps

### E2E-NEWS-03 — Newsletter send history

- **Test Steps:**
  1. After NEWS-02 Send Now to `MAIL_A` + `MAIL_B`.
  2. `/newsletter` history shows QA send; Total sent +2.
- **Expected Result:** QA send listed with correct subject/time/recipient count.
- **Actual Result (Oct):** History UI loads; no NEWS-02 send.
- **Status:** Blocked
- **Unlock:** NEWS-02 (`MAIL_A` + `MAIL_B`)

### E2E-IMG-01 — Mockup editor (no AI)

- **Test Steps:**
  1. `/mockup-editor` → Jersey — Chest.
  2. Place `LOGO_PNG`, move/resize/delete/re-add, Export PNG (no AI).
- **Expected Result:** Exported PNG has logo, no guides.
- **Actual Result (Oct):** Editor loads; no `LOGO_PNG` kit. (Nov proposal jersey gen ≠ this pack case.)
- **Status:** Blocked
- **Unlock:** `LOGO_PNG` kit file

### E2E-IMG-10 — Asset library and brand assets

- **Test Steps:**
  1. After IMG-02–06 pack images exist, open `/assets` and `/brand-assets`.
  2. Search QA assets; confirm no “Migration required”.
- **Expected Result:** Pack images in library; both pages load.
- **Actual Result (Oct):** Pages load; **0** QA assets. (Nov throwaway media is not pack IMG-02–06 library rows.)
- **Status:** Blocked
- **Unlock:** Authorize IMG-02–06 + logo kit

### E2E-END-02 — Money check

- **Test Steps:**
  1. Record `/system` AI Spend Cap at start of a UTC day (PRE-07 style).
  2. Run authorized paid AI (~40 text + 5 images).
  3. Compare same UTC day end meter.
- **Expected Result:** Delta believable; huge jump (>3×) = Fail.
- **Actual Result (Oct):** Meter `$0.00` on a later UTC day; could not compare to PRE-07 day.
- **Status:** Blocked
- **Unlock:** Same-UTC-day baseline + authorized AI pack run

---

## Section C — Remaining (145 Not Run) — checklist

Each ID appears **once**. None Pass until unlocks + fresh QA data. Titles are master-pack headings from the Oct matrix.

### Group B — Requires MAIL_A / MAIL_B (31)

| ID | Title | Prerequisite |
|---|---|---|
| CO-11 | CSV import | MAIL_B as `QA CSV Person` |
| CO-12 | Delete a contact | CO-11 |
| MAIL-02 | Draft the intro email | MAIL_A + approved Alpha + Generate email (AI) |
| MAIL-03 | The draft is correct | MAIL-02 |
| MAIL-04 | Send a test copy | MAIL_A inbox |
| MAIL-05 | Test copy to a bad address | MAIL-02 |
| MAIL-06 | Approve the email | MAIL-02 |
| MAIL-07 | "Mark as Sent in Pipedrive" | MAIL_A + PD |
| MAIL-08 | The test copy's links work | MAIL-04 |
| MAIL-09 | Cannot be marked sent twice | MAIL-07 |
| MAIL-10 | Other email flows | MAIL_B + Alpha + Generate (AI) |
| MAIL-11 | Follow-up draft from a sent email | MAIL-07 |
| MAIL-17 | Sender profiles | MAIL_A + second sender |
| NEWS-02 | Send now to your two inboxes | MAIL_A + MAIL_B |
| NEWS-04 | Unsubscribe works | NEWS-02 |
| NEWS-05 | A suppressed contact cannot be marked as sent to | NEWS-04 |
| NEWS-06 | Schedule for later | MAIL_A/B |
| PORT-01 | Ask for a link with the contact's email | MAIL_A as Alpha contact |
| PORT-02 | An unknown email gets the same answer | Owned unused address |
| PORT-03 | The link logs the sponsor in | PORT-01 |
| PORT-04 | Portal shows only Alpha | PORT-03 |
| PORT-05 | Delivery and proof in the portal | PORT-03 + CON |
| PORT-06 | Sponsor accepts a delivery | PORT-03 |
| PORT-07 | Recap in the portal | PORT-03 |
| PORT-08 | Sponsor cannot read someone else's data | Second portal identity |
| PORT-09 | Sign out of the portal | PORT-03 |
| PORT-10 | A used or old link | PORT-01 |
| PORT-11 | Portal in the narrow window | PORT-03 |
| LEAD-01 | Sports clubs page and one lead | MAIL_B or QA_LEAD_EMAIL |
| LEAD-02 | Lead reaches the staff side, once | LEAD-01 |
| ADM-01 | Invite a user | MAIL_A + invite |

### Group C — Requires Bravo / Charlie (19)

| ID | Title | Prerequisite |
|---|---|---|
| CO-16 | Create the other test companies | MAIL_B + ENRICH_SITE |
| DISC-01 | Company AI analysis | Bravo + paid AI |
| DISC-02 | Company analysis survives a refresh | DISC-01 |
| DISC-03 | Scrape the company website | Bravo + ENRICH_SITE |
| DISC-04 | Contact discovery | Bravo + Hunter/lookup |
| DISC-05 | Competitor sponsors | Bravo + AI |
| DISC-06 | Opportunity gap finder | Bravo + Analyze |
| DISC-10 | Industry search in bulk campaigns (look only) | Bravo+Charlie for Pass |
| PROP-15 | Every other proposal type, one each (Charlie) | Charlie |
| PROP-16 | Barter deal terms and split | Charlie barter proposal |
| APPR-05 | Approver rejects (Charlie barter) | Charlie + APPROVER |
| APPR-06 | Rejected proposal fixed and re-submitted | APPR-05 + REP |
| AGENT-02 | Outreach Agent on one company (Bravo) | Bravo + AI |
| AGENT-03 | Cancel a stuck run | AGENT-02 |
| BULK-01 | Bulk campaigns (2 companies) | Bravo+Charlie + AI |
| BULK-02 | Bulk proposals (2 companies) | Bravo+Charlie + AI |
| BULK-03 | Campaign outreach batch (Bravo) | Bravo + AI |
| BULK-04 | Bulk approve, QA items only | Charlie + APPROVER |
| BULK-05 | Auto-approve on a pre-approved campaign | CAMP-05 path fixed + re-run |

### Group D — Requires REP / APPROVER / VIEWER logins (15)

| ID | Title | Prerequisite |
|---|---|---|
| AUTH-08 | Two logins at once | VIEWER login |
| APPR-01 | Sales Rep submits Alpha | REP + Alpha + logo |
| APPR-02 | Approver sees it in the queue | Active APPROVER |
| APPR-03 | Approver asks for a revision | APPROVER + submitted Alpha |
| APPR-04 | Rep edits and re-submits | REP + APPR-03 |
| APPR-07 | Approver approves Alpha | APPROVER + resubmitted Alpha |
| APPR-08 | Approval permanent in audit log | APPR-07 |
| APPR-09 | Approving a campaign | APPROVER + campaign queue |
| REF-06 | Claims registry | REP then APPROVER |
| REF-07 | Claims: new version | REF-06 + REP |
| ROLE-01 | Viewer | VIEWER |
| ROLE-02 | Sales Rep | REP |
| ROLE-03 | Approver | Active APPROVER |
| ROLE-05 | A role change takes effect | ADM-01 QA Invitee |
| ROLE-06 | Rep cannot approve own submission | REP + Alpha duplicate |

### Group E — Requires Alpha proposal or contract (49)

Cleanup removed prior Alpha; recreate then Generate.

| ID | Title | Prerequisite |
|---|---|---|
| PROP-05 | List, filters and search | Alpha Draft |
| PROP-06 | Edit and save as a new version | Alpha |
| PROP-07 | A / B / C wording options | Alpha |
| PROP-08 | Enrich the proposal | Alpha + paid AI |
| PROP-09 | Landing page and its five layouts | Alpha |
| PROP-10 | Deck and PDF | Alpha |
| PROP-11 | Duplicate | Alpha |
| PROP-12 | Content blocks page | Alpha |
| PROP-13 | Documents on the proposal | Alpha |
| PROP-14 | A/B test setup | Alpha |
| PROP-17 | Proposal templates | Alpha save-as-template |
| MAIL-01 | Outreach only after approval | Duplicate Alpha draft (no send) |
| SHARE-01 | Draft not visible to sponsors | Alpha draft |
| SHARE-02 | Create link on approved Alpha | Approved Alpha |
| SHARE-03 | Sponsor opens link, logged out | SHARE-02 |
| SHARE-04 | Terms and LGPD | SHARE-02 |
| SHARE-05 | Sponsor sees real delivery | SHARE-02 + CON |
| SHARE-06 | Interest form | SHARE-02 |
| SHARE-07 | Staff sees who looked | SHARE-03 |
| SHARE-08 | Password gate on the link | SHARE-02 |
| SHARE-09 | Sponsor keeps approved wording while staff edits | SHARE-02 |
| SHARE-10 | Re-approve the new wording | APPROVER + SHARE-09 |
| SHARE-11 | Revoke the link | SHARE-02 |
| SHARE-13 | WhatsApp share | Approved Alpha |
| CON-01 | Create Contract only for approved | Approved Alpha + draft |
| CON-02 | Contract form checks input | CON-01 |
| CON-03 | Create the Alpha contract | Approved Alpha |
| CON-04 | Contract list and totals | CON-03 |
| CON-05 | Signed proposal cannot be edited quietly | CON-03 |
| CON-06 | Delivery list from contract | CON-03 |
| CON-07 | Fulfilment checklist on proposal | CON-03 |
| CON-08 | Open one delivery item | CON-06 |
| CON-09 | Add a match, link to item | CON-08 |
| CON-10 | Proof: written statement | CON-08 |
| CON-11 | Proof: link and file | CON-08 |
| CON-12 | Proof pack | CON-10/11 |
| CON-13 | Delivery on sponsor link | SHARE + CON |
| CON-14 | Recap | CON deliveries |
| CON-15 | Issue the recap | CON-14 |
| CON-16 | Only approvers/admins can issue | APPROVER vs REP |
| CON-17 | Contract dates and renewals | CON-03 |
| CON-18 | Electronic signature (Documenso) | CON-03 + Documenso + MAIL |
| CON-19 | Delete a match | QA match on delivery |
| REF-01 | Inventory reflects the contract | Alpha contract |
| REF-02 | Edit inventory (remainder) | Alpha proposal/contract price check |
| REF-03 | Delete an item that is in use | Alpha contract in use |
| REP-03 | Monthly sponsor report | Alpha + Generate Report |
| DATA-01 | One deal, one set of numbers | Alpha proposal + contract |
| DATA-02 | Names and dates agree | Alpha proposal + contract |

### Group F — Requires approved AI generation (6)

| ID | Title | Prerequisite |
|---|---|---|
| DISC-07 | Product discovery search | Paid AI + scrape (`chuteiras de futebol`) |
| IMG-02 | Jersey mockup (AI image 1 of 5) | Paid AI + LOGO_PNG |
| IMG-03 | Stadium mockup (AI image 2 of 5) | Paid AI + logo |
| IMG-04 | Campaign creative (AI image 3 of 5) | Paid AI + logo |
| IMG-05 | Image job create/approve/generate (4 of 5) | Paid AI + logo |
| IMG-06 | Regenerate (5 of 5) | IMG-02..05 |

*Note:* Nov throwaway jersey/stadium/creative/video verified product behaviour; **Oct pack IMG-02–06 IDs remain Not Run** until scored against pack steps + `/assets` library.

### Group G — Requires authorized Pipedrive writes (3)

| ID | Title | Prerequisite |
|---|---|---|
| CRM-08 | Add a lead to the pipeline | Bravo + PD write auth / sandbox |
| CRM-09 | Move a card | CRM-08 QA card only |
| LEAD-06 | Lead company reaches Pipedrive | LEAD-01/02 + PD write |

### Group H — Requires QA images or logo kit files (9)

| ID | Title | Prerequisite |
|---|---|---|
| LOGO-01 | No logo: warning and locked button | Alpha proposal |
| LOGO-02 | Wrong file type | `BAD_FILE` |
| LOGO-03 | File too large | `BIG_FILE` |
| LOGO-04 | Upload the PNG | `LOGO_PNG` + Alpha |
| LOGO-05 | Logo versions | LOGO-04 |
| LOGO-06 | SVG logo | `LOGO_SVG` + Charlie |
| LOGO-07 | Same logo on many proposals | `LOGO_PNG` + drafts |
| IMG-08 | Link an image to the proposal | QA image + Alpha |
| IMG-09 | Download | QA image with output |

### Group I — Other dependencies (13)

| ID | Title | Prerequisite |
|---|---|---|
| CAMP-06 | Pre-approval stops after text/package changes | **Pass (23-Nov)** — package change expired preapproval |
| CRM-01 | Organization created from the company | Pipedrive UI login `PD` |
| CRM-02 | Contact created as a person | `PD` + MAIL_A |
| CRM-03 | Editing does not create a duplicate | `PD` + Alpha edit |
| CRM-04 | Approval creates one deal | `PD` + approved Alpha |
| CRM-05 | Rejection/revision reach the deal | `PD` + Charlie |
| CRM-06 | The email was logged | `PD` + MAIL-06/07 |
| REP-05 | Audit trail complete (remainder) | Later proposal/contract/proof/email/share/portal events |
| ADM-03 | Change role, deactivate, reactivate | ADM-01 QA Invitee only |
| TEAM-01 | Pipedrive goes wrong, app stays usable | Team changes PD key |
| TEAM-02 | Gmail disconnected | Team disconnects Gmail |
| TEAM-03 | AI provider fails | Team invalidates AI key |
| TEAM-04 | Link-existing check before real pushes | Team dry-run + `PD` |

### Remaining ID checklist (145 unique)

AUTH-08; CO-11, CO-12, CO-16; DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-10; CAMP-06; PROP-05, PROP-06, PROP-07, PROP-08, PROP-09, PROP-10, PROP-11, PROP-12, PROP-13, PROP-14, PROP-15, PROP-16, PROP-17; LOGO-01, LOGO-02, LOGO-03, LOGO-04, LOGO-05, LOGO-06, LOGO-07; APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, APPR-07, APPR-08, APPR-09; IMG-02, IMG-03, IMG-04, IMG-05, IMG-06, IMG-08, IMG-09; SHARE-01, SHARE-02, SHARE-03, SHARE-04, SHARE-05, SHARE-06, SHARE-07, SHARE-08, SHARE-09, SHARE-10, SHARE-11, SHARE-13; MAIL-01, MAIL-02, MAIL-03, MAIL-04, MAIL-05, MAIL-06, MAIL-07, MAIL-08, MAIL-09, MAIL-10, MAIL-11, MAIL-17; NEWS-02, NEWS-04, NEWS-05, NEWS-06; CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, CRM-06, CRM-08, CRM-09; CON-01, CON-02, CON-03, CON-04, CON-05, CON-06, CON-07, CON-08, CON-09, CON-10, CON-11, CON-12, CON-13, CON-14, CON-15, CON-16, CON-17, CON-18, CON-19; PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, PORT-08, PORT-09, PORT-10, PORT-11; LEAD-01, LEAD-02, LEAD-06; AGENT-02, AGENT-03; BULK-01, BULK-02, BULK-03, BULK-04, BULK-05; REF-01, REF-02, REF-03, REF-06, REF-07; REP-03, REP-05; ADM-01, ADM-03; ROLE-01, ROLE-02, ROLE-03, ROLE-05, ROLE-06; DATA-01, DATA-02; TEAM-01, TEAM-02, TEAM-03, TEAM-04.

---

## Section D — Manager unlocks (required before remaining can Pass)

1. **MAIL_A** and **MAIL_B** — owned inboxes the tester can read.  
2. **VIEWER** and **REP** logins. **APPROVER:** password + authorization to reactivate `admintest@coritiba.com.br` (do not change ADMIN).  
3. Authorize **Alpha Generate** (PROP-03) on a **new** QA company (cleanup wiped old Alpha).  
4. **ENRICH_SITE** + MAIL_B so CO-16 can create Bravo and Charlie.  
5. Pipedrive UI login **`PD`** (CRM-01–06). Separately: **`PD_MODE=sandbox`** or live QA-write auth for CRM-08/09 / LEAD-06.  
6. Logo kit: **`LOGO_PNG`, `LOGO_SVG`, `BAD_FILE`, `BIG_FILE`**.  
7. Authorize remaining **paid AI** (DISC / IMG / MAIL generate / BULK).  
8. **TEAM** appointment for TEAM-01–04. **Documenso** for CON-18.

**Do not** use live sponsor proposals, send to real sponsors, drag production Pipedrive cards, Archive Test Companies / Run All Fixes, or invent mailboxes.

---

## Section E — Suggested rebuild order (clean slate)

1. Recreate **QA E2E Test Alpha** (+ contact with MAIL_A when available).  
2. Re-verify **Oct Fail fixes** that need a company (CO-08, CAMP-*, PROP-03, etc.).  
3. Clear **Blocked** that unlock next: PROP-04 → SHARE/CON/SEC proof paths.  
4. CO-16 Bravo/Charlie → DISC / BULK / AGENT.  
5. MAIL / NEWS / PORT / LEAD with MAIL_A/B.  
6. ROLE / APPR with VIEWER/REP/APPROVER.  
7. IMG/LOGO pack IDs (distinct from Nov throwaway media).  
8. END-02 same-UTC-day spend after authorized AI day.

---

## Section F — Nov features still without formal Oct-style E2E IDs

| Feature | Status | Note for Abhishek |
|---|---|---|
| Staff password (change / forgot / invite set-password) | Live tested; PR #27 bugs fixed | Optional: add formal E2E IDs to pack |
| Calendar / `meeting_link` | Live tested | Optional pack addendum |
| Formativa / Feminino Generate guard | Live tested | Optional pack addendum |
| Proposal jersey / stadium / creative / video intro | Live tested on throwaway | Not a substitute for Oct IMG-02–06 / IMG-01 / IMG-10 scoring |
| AI provider fallback | Unit + docs | Live E2E optional |
| SES primary send + SNS events | **Covered in A0** (MAIL-05/07 partial — simulator + SNS bounce 16 Nov) | Formal MAIL pack with MAIL_A/B still open |
| Graph reply-sync | **Covered in A0** (Pass 19 Nov) | Score as Pass; was wrongly listed “not scored” here |
| Seller-name guard | Unit | Live discovery case not scored |

---

## Stopped / handoff

**For Abhishek:**  
- Wizard Components label **fixed + live-verified** (23-Nov PM). Code on branch `redesign-tasks-yash` (uncommitted): review + `saveDraft` inventory lines. Live bundle rebuilt/restarted on this host — **you still need to commit/push/PR**.  
- Non-AI Oct Fail re-verify **Pass:** CAMP-03/05/06/07, ADM-07, NEWS-01, REF-05/08, CRM-07, SEC-06, LEAD-03, UI-07, IMG-07.  
- **PROP-03 Generate** still waiting on OpenAI credits.  
- Still not re-run: UI-01/05/08/12, SEC-04/05/13.  
- Alpha closed again; barter QA reset; leftover draft campaign copy `3da94c12-…` ok to archive.  

**Source of truth for Oct execution detail:** `E2E_testcases_result.md`  
**Source of truth for current remaining/blocker list:** this file (`E2E_REMAINING_STATUS_REPORT.md`)

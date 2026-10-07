# Blockers and follow-ups register

Started 6 Oct 2026 for Abhishek's numbered tasks (see `Abhishek's tasks 2nd october.md`). **Update this file after every task**, then revisit everything marked Open when the last task is done.

**How to read it**
- **Type:** Decision (someone has to choose), Account (needs a paid account or key), Yash (his side of the work), Test gap (could not be tested live), Tech debt, Security, Deploy.
- **Owner:** who can clear it. James = client side, Yash = colleague, Abhishek = us.
- **Status:** Open / Cleared. Cleared items stay listed so nothing is re-litigated.


**Open items right now: 114** (counted from the tables below; refresh after each task)

| Owner | Open |
|---|---|
| Abhishek | 55 |
| James | 38 |
| Yash | 14 |
| Yash / James | 3 |
| James / the club | 3 |
| James / Yash | 1 |

| Type | Open |
|---|---|
| Tech debt | 25 |
| Decision | 24 |
| Yash | 12 |
| Test gap | 10 |
| Account | 9 |
| Deploy | 7 |
| Data | 6 |
| Content | 6 |
| Security | 5 |
| Known limit | 5 |
| Behaviour | 4 |
| Removed | 1 |

Use this to plan the final sweep: James and Yash items need their input, Abhishek items can be done in one pass.

---

## A. Cross-cutting (affect several tasks)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| X-01 | Deploy | Abhishek | Tasks 1–5 and the cost controls exist only on `abhishek-tasks`. Production (new EC2) runs `08-Sep-saas-buildout`. | Decide: cherry-pick onto the production branch, or wait for Yash to merge PR #3. Then build, restart, health check. | Open |
| X-02 | Deploy | Yash | PR #3 (`abhishek-tasks` into `redesign-tasks-yash`) is a draft until all tasks are done. | Mark ready, Yash reviews and merges. | Open |
| X-03 | Test gap | Abhishek | One existing unit test fails (`OpenAIRenderer sends base photo and sponsor logo...`, expects `'high'`, gets undefined). CI runs it non-blocking. | Fix the test or the renderer, then make the CI step blocking. | Open |
| X-04 | Tech debt | Abhishek | `performed_by: auth.user.id` is passed to the audit helper in several routes, but that column points at a different users table. The audit rows fail silently (the helper swallows errors). Found while testing Tasks 3 and 5. | Sweep all callers: drop `performed_by`, keep the actor in metadata. | Open |
| X-05 | Tech debt | Abhishek | Hydration warnings (React #418/#425/#423) on generated proposal detail pages. Cause not traced. | Reproduce in a dev build, find the mismatching text or date. | Open |
| X-06 | Security | Abhishek | The git remote holds a plaintext GitHub token. The GitHub MCP connector also has bad credentials, and `git credential fill` returns a stale one. | Rotate the token, store it properly, re-link the connector. | Open |
| X-07 | Security | Abhishek | Old Anthropic key (`…4wPwAA`) still sits in plaintext in Cursor history, Claude file-history and session transcripts. The valid key (`…37eQAA`) is also in several plaintext files. | Rotate both keys; clear the stale copies. | Open |
| X-08 | Tech debt | Abhishek | Every environment (this box, Yash's dev, my test server, production) shares one Supabase project. Test data is visible to production, and migrations take effect for everyone instantly. | Keep migrations additive. Consider a separate staging project. | Open |
| X-09 | Tech debt | Abhishek | Bedrock credentials are dead; every AI call tries Bedrock first (now short-circuited after one failure). | Remove the Bedrock path, or restore the credentials. | Open |
| X-10 | Account | James | **Real email provider (SES) account.** Without it nothing is ever "provider accepted / delivered"; "send" only logs to the CRM. Blocks tasks 5 (real states) and 28. | Account created, sender domain verified, keys supplied. | Open |
| X-11 | Account | James | **Pipedrive key.** An earlier note says it needs a fresh key; with it blank or invalid, every send records "CRM logging failed". | Fresh key supplied. | Open |
| X-12 | Account | James | **Documenso account** (Teams tier). No real e-signature has ever been tested. | Account and API key supplied. | Open |
| X-13 | Decision | Yash | Project and task system of record: Pipedrive Projects vs Plane vs custom. Blocks Task 22 and shapes 15–17. | His decision, written down. | Open |
| X-14 | Decision | Yash / James | CRM direction: keep Pipedrive canonical with a bounded Twenty pilot, or replace it. Affects 24 and the adapter work. | Decision recorded. | Open |
| X-15 | Yash | Yash | **No screens exist for any of the new data.** Approval-card state labels, revision history, trace view, signer progress, recap, batch preview, portal shell. All the data is available through APIs only. | His UI work (his Priority 2b, 6, 7, 8). | Open |
| X-16 | Test gap | Abhishek | Any test that calls the AI spends real money, and generated proposals must be cleaned up afterwards. | Keep seeding data by script where AI is not the thing under test. | Open |
| X-17 | Account | James | Other James-held items from the handoff list that touch my work: Stripe (billing), Apify cap, logo.dev key, e2e-tenant2 password, logout bug repro, domain decision, old EC2 fate. | James answers each. | Open |

---

## B. Per task

### Task 1: one availability and rate service (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T1-01 | **Decision** | James / Yash | **Which price is canonical.** Builder tier prices (for example Master R$250K) are far below catalog ranges (R$8.5M–22M), and the period is unclear. Today the builder only shows a "confirm" chip. | A written rule: which price wins, and per what period. | Open |
| T1-02 | Tech debt | Abhishek | `unit_type` is the schema default `per_season` on most rows (86 of 115 disagree with the free-text `unit`). The UI marks these "(assumed)". | Clean the data, then drop the free-text `unit`. | Open |
| T1-03 | Tech debt | Abhishek | Availability is still partly a hand-set flag (`availability = sold`) next to the counters. | Once counters are trustworthy, retire the manual flag. | Open |
| T1-04 | Test gap | Abhishek | Tested sold-out blocking, but not a normal successful generation until the AI key was fixed; that was then tested. | Done. | Cleared |

### Task 2: last-unit protection (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T2-01 | **Decision** | Abhishek | **Master is held by 2 active contracts** despite being a 1-unit exclusive asset. The reconcile check shows "recorded 0, expected 2". | Decide whether to apply the correction (it then blocks new contracts for Master). | Open |
| T2-02 | **Decision** | James | **Category exclusivity** ("one bank per category") has no data model. Only the per-item `is_exclusive` flag exists. | Define sponsor categories, which assets are exclusive within them, and how competitors are matched. | Open |
| T2-03 | Tech debt | Abhishek | Per-match capacity is unprotected (per-match and digital units carry a default total of 1). | A capacity-per-match model. | Open |
| T2-04 | Tech debt | Abhishek | A single-unit asset cannot be renewed while its old contract is "active": capacity only releases on a status change, never at the contract end date. | Per-period capacity (a date-ranged reservation). | Open |
| T2-05 | Tech debt | Abhishek | Multi-line commits roll back by compensation, not a database transaction. A crash mid-way could leak a unit. | Move to a transactional function, or rely on the reconcile endpoint. | Open |
| T2-06 | Deploy | Abhishek | `POST /api/inventory/reconcile` (apply) has not been run on real data. | Decide with T2-01. | Open |

### Cost controls (done, not numbered)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| C-01 | Account | Abhishek | **No Console spend limit or alerts** set on the Anthropic workspace. This is the only backstop that holds if the app is bypassed. | Set a workspace limit and alerts. | Open |
| C-02 | Deploy | Abhishek | `DAILY_SPEND_CAP_USD` is unset in the env files I could see, so the cap defaults to $25 a day. | Set it in production's `.env.local` (5 to 10 suggested) and restart. | Open |
| C-03 | Decision | Abhishek | Caching only saves about 12% per call (output tokens are about 75% of the cost). Bigger levers need an eval first: a cheaper model for simple routes, shorter outputs, moving the static JSON template into the cached prefix. | Build a small eval, then test each lever. | Open |
| C-04 | Deploy | Abhishek | Cost controls are not on production (see X-01). | Deploy. | Open |
| C-05 | Test gap | Abhishek | Agent-loop caching (tools plus rolling history) was verified by code and request shape only, not by a live agent run. | Run one agent and read the cache meters. | Open |
| C-06 | Test gap | Abhishek | The throttle and in-flight cap are unit-tested only, not exercised by a real burst. | A controlled burst test. | Open |
| C-07 | Cleared | Abhishek | The Anthropic organization was disabled; the production key was replaced and the app restarted on 5 Oct. | Done. | Cleared |

### Task 3: immutable revisions and frozen quote lines (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T3-01 | Yash | Yash | No screen for revisions or the "changed since approval" state. | His UI work. | Open |
| T3-02 | Tech debt | Abhishek | An active contract's terms cannot be edited (409), but there is no amendment flow to change them properly. | Build amendments (relates to Tasks 16–17). | Open |
| T3-03 | Decision | James | Who defines **tax treatment** values and the discount-authority rules (today: whoever may approve proposals can grant any discount). | A written policy, for example discount limits per role. | Open |
| T3-04 | Tech debt | Abhishek | The frozen quote total is not yet used by contracts (`total_value_brl` is still typed in). | Tasks 4 and 16 wiring. | Open |
| T3-05 | Deploy | Abhishek | Migration 0052 is applied in the shared project; the code is on `abhishek-tasks` only. | Deploy (X-01). | Open |

### Task 4: one allocation ID end to end (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T4-01 | Tech debt | Abhishek | Two sets of delivery tasks per contract (free-text deliverables plus per-allocation tasks). | Merge them in Task 16. | Open |
| T4-02 | Test gap | Abhishek | The renewal agent hook was not run live (it processes every real expiring contract and spends AI). Its carry function was tested against the real database. | Test with a contract created for the purpose and the agent scoped to it. | Open |
| T4-03 | Yash | Yash | No screen for the allocation trace. | His UI work. | Open |
| T4-04 | Tech debt | Abhishek | Renewal lines carry the old frozen price and have no period; pricing and dates need a human. | Part of Task 18 and the per-period capacity work (T2-04). | Open |

### Task 5: truthful send states and signatures (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T5-01 | Account | James | **No email provider**: the "provider accepted / delivered / opened" states can only be simulated (see X-10). The platform does not email anyone; the newsletter does not either. | SES account, then build the provider adapter and its callback. | Open |
| T5-02 | Account | James | **Documenso never tested for real** (see X-12). The recipient mapping is checked against the SDK types only. | Account, then a real send and sync. | Open |
| T5-03 | Security | Abhishek | The Documenso webhook does not verify its signature yet (it re-fetches status, so it cannot be spoofed into a wrong state). | Add verification once the account shows the secret. | Open |
| T5-04 | Test gap | Abhishek | **Multi-signer sending** is not built or tested; tracking supports it. | After T5-02. | Open |
| T5-05 | Tech debt | Abhishek | Provider adapter, outbox and retry logic for real sends. | Task 28. | Open |
| T5-06 | Yash | Yash | State labels are not on any screen. Existing screens still show the legacy "sent" badge. | His Priority 2b. | Open |
| T5-07 | Tech debt | Abhishek | `emails.status = 'sent'` still means "logged in the CRM" for older code paths. | Retire it once the UI reads the derived state. | Open |
| T5-08 | Security | Abhishek | The callback paths are exempt from the login check and rely on `INTERNAL_API_SECRET` alone. | Rotate it, and move to per-provider signature verification. | Open |

### Task 6: signature and revision proof trail (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T6-01 | Account | James | The real Documenso path (signed PDF download, hash stored, completion record) has never run; today it is covered by simulated callbacks and the manual path (see X-12). | Documenso account, then a real send, sign and sync. | Open |
| T6-02 | **Decision** | James | **May "Mark as Active" stay allowed without signature evidence?** It is still allowed, but is now recorded as a claim and shown as "Marked active, no signature evidence". | Choose: keep, require evidence first, or expire unverified claims after N days. | Open |
| T6-03 | Yash | Yash | No screen: stage badge from the proof, evidence timeline, manual-signature upload form, the second-person verify and reject buttons, bundle download. | His UI work. | Open |
| T6-04 | Decision | James | Who may verify a manual signature (today anyone with approve permission who is not the recorder). | Decide if it needs a specific role or an admin. | Open |
| T6-05 | **Security** | Abhishek | **Signed documents are stored in the public `proposal-assets` bucket and read through a public URL**, so anyone with the link can read a signed contract. The existing signed PDF does the same. | Move to a private bucket with short-lived signed URLs. | Open |
| T6-06 | Tech debt | Abhishek | "Mark as Active" on a proposal that has no contract record leaves no proof trail (evidence belongs to a contract). | Require a contract record, or create one automatically. | Open |
| T6-07 | Tech debt | Abhishek | Revisions frozen between migration 0052 and 0055 have no stored title and show "cannot recompute". None exist in the database now. | Nothing needed unless real approvals were made in that window. | Open |
| T6-08 | Test gap | Abhishek | The second-person case was tested with a claim recorded under another identity, because there is only one test login. | Test with two real users once a second account exists. | Open |

### Task 7: one definition per metric (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T7-01 | **Decision** | James | **What counts as "pending approval"?** The registry now says: proposals under review plus emails pending approval (39 today). The Approvals queue page also lists drafts and already-approved items (173 cards), and says so on the page. | Confirm the definition, or tell us to narrow the queue to match it. | Open |
| T7-02 | **Decision** | James | **Win rate denominator.** Today: won / (won + rejected). Proposals still in play are not counted. | Confirm "rejected" means lost, and whether stale or expired proposals should count as lost. | Open |
| T7-03 | **Decision** | James | **Pipeline value basis.** Priced from package options (cheapest to dearest, options never summed). Only 2 of 64 open proposals have a package, so the figure is a floor, not a forecast. | Decide the pricing rule for proposals without a package (rate card or manual quote). | Open |
| T7-04 | Data | James | **Contracted value is empty.** 2 of 2 active contracts have no value recorded, so revenue shows "—" with a caveat instead of 0. | Enter the contract values (or confirm they come from the CRM). | Open |
| T7-05 | Data | James | 4 proposals are marked in contract, but only 2 active contract records exist (see T6-06). The dashboard and Reports show both numbers with the gap named. | Create the missing contract records, or move those proposals back. | Open |
| T7-06 | Yash | Yash | No screen consumes `/api/metrics` yet: definition tooltips, drill-down links (`href` on every metric) and the "as of" timestamp are available but unused. | Use the endpoint in the dashboard and reports redesign. | Open |
| T7-07 | Tech debt | Abhishek | Reports "Active Sponsors" list is proposals marked in contract, while its caption also cites contract records. | Move the list to contract records once T7-05 is resolved. | Open |
| T7-08 | Known limit | James | "Emails marked sent" is logged in the CRM only; this platform does not email recipients yet (X-10). The label says so. | SES account, then real sending (see X-10). | Open |

### Task 8: claim provenance registry (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T8-01 | **Content** | James / the club | **Every seeded claim is unreviewed, so sponsors currently see no club figures** on the deck, the KPI cards or the landing page (by design). Someone has to fill in each claim's source, owner, dates and verify it on `/claims`. | A named owner per claim and one pass through `/claims`. This is also Task 9's content work. | Open |
| T8-02 | **Content** | James / the club | **Figures that contradict each other** were in circulation: average attendance (15–30k in the AI prompt, 18–28k in the old table, 23 mil on the deck, 25–36k in the KPI cards), members (36 mil vs 38.000+), social followers (1.5M+ vs per-platform rows adding to 1.35M+ before X). Each is recorded on its claim; the registry holds one value. | Pick the true figure for each. The old table also holds every metric twice (the seed ran on 18 May and 17 Jul). | Open |
| T8-03 | **Content** | James | **"Marcas que confiam no Coritiba"** listed Heineken, Ambev, Itaú, Toyota, Red Bull, Claro and TIM on every landing page. Red Bull and Heineken are also the AI prompt's global inspiration examples, so this may never have been a partner list. Now a claim, hidden until verified. | Confirm each name is a real partner. | Open |
| T8-04 | **Removed** | Yash / James | **"Próximas Partidas" is gone from the sponsor landing page.** Its opponents, attendances and TV audiences were invented examples (the code comment said so) and it promised "calendar updated every round". | Rebuild it from real fixtures (the `matches` table the deck already uses) when you want it back. | Open |
| T8-05 | **Data** | James | The public sponsor page's WhatsApp button points at `5541999999999`, an obvious placeholder. Not changed in this task. | The club's real number. | Open |
| T8-06 | Decision | James | Free-text figures can still appear in AI-written or hand-edited proposal text (a live proposal says "mais de 1 milhão de telespectadores por partida"). Approval now lists these as unsourced figures, but does not block. | Decide: warn only, or block approval while unsourced figures remain. | Open |
| T8-07 | Yash | Yash | `/claims` is a working but unstyled review screen. Still to design: unsourced-figure list on the approval card (`GET /api/proposals/[id]/claims`), expiry reminders, a notice on the deck when figures are withheld. | Design and wire. | Open |
| T8-08 | Tech debt | Abhishek | **Partly cleared in Task 9:** the `/coritiba-intelligence` page now reads the registry and the old form and write API are gone. What remains is the old `coritiba_metrics` table and its duplicate rows (tracked as T9-07). | Delete the table's rows, with your OK. | Open (see T9-07) |
| T8-09 | Tech debt | Abhishek | Other tenants' `club_facts.follower_count` and `typical_attendance` no longer reach prompts, decks or KPI cards. They have to be entered as claims. The Coritiba prompt text still carries unsourced broadcast and competition wording in `market_context`. | Tenant onboarding step that creates claims; move `market_context` figures into claims. | Open |
| T8-10 | Behaviour | James | Sponsor pages read the registry when opened, so a claim that expires after a proposal was approved quietly disappears from the link already sent. The approval step records what was shown at the time. | Decide if an expired figure should instead be flagged to the proposal owner. | Open |
| T8-11 | Test gap | Abhishek | The "second person must verify" rule was tested live with two real logins (a sales rep who recorded figures and an approver who verified them). The case of one person holding both permissions (an admin verifying their own version) is covered by unit tests only. T6-08 is still open for contracts. | Test the admin self-verify case once a second admin account exists. | Cleared except admin case |

### Task 9: club-facts and incentive-page content (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T9-01 | **Content** | James | **Seven proposed corrections and three law claims are in the registry as unreviewed, with no owner**, so sponsors still see no club figures. Two corrections matter: national titles is **1** (1985), not 2, because the 1990 Série A was won by Corinthians; and home matches is **19** league games, not "38+" (38 is the number of league rounds). | Take ownership, check the sources on `/claims`, and verify (or correct) each. | Open |
| T9-02 | **Content** | James | **The incentive-law figures could not be checked against the official statute text from here** (the government site refused the connection). The sports-law claim (1% of tax owed for companies, 6% for individuals) comes from a compilation that says the incentive ran 2007 to 2015, and the law has since been extended; the Rouanet claim (4% for companies) rests on a legal article. The old template said "up to 100% of the amount invested", which is wrong. | Confirm the current validity window and the limits against the official text before verifying. | Open |
| T9-03 | **Content** | James / the club | Average attendance and follower figures were **not** proposed because sources conflict (2025 averages of about 19.5k and 22k appear for different divisions). | The club's own figure and the period it covers. | Open |
| T9-04 | Decision | James | Stadium capacity: official 40,502, but press reports a safe operating limit near 38,000. | Decide which figure sponsors are quoted. | Open |
| T9-05 | Tech debt | Abhishek | Unsourced wording remains outside the registry: the `market_context` text in the Coritiba prompt (broadcast partners, competitions), the "IR Dedutível" labels in the proposal wizard, and a placeholder in the social-project form that mentions a 1% limit. | Move each into claims, or drop the figure. | Open |
| T9-06 | Yash | Yash | `/coritiba-intelligence` and `/lei-de-incentivo` are functional but unstyled. | Restyle. | Open |
| T9-07 | Tech debt | Abhishek | The page and API for the old `coritiba_metrics` table are retired (T8-08), but the table and its duplicate rows still exist. | Delete the table's rows, with your OK. | Open |

### Task 10: three account stages and company structure (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T10-01 | **Decision** | James | **64 companies were marked "qualified" automatically** (labelled "grandfathered"): any company that already had a proposal, a contract or an advanced pipeline stage. The other 476 are directory entries, and none is "researched" yet. | Confirm that rule, or tell us which of the 64 are not real opportunities (they can be revoked one by one). | Open |
| T10-02 | **Decision** | James | Dragging a card to an advanced pipeline column records a human qualification, but dragging it back does **not** revoke it. | Decide: leave it explicit (revoke with a reason), or revoke automatically. | Open |
| T10-03 | **Data** | James | Duplicate review found **4 same-entity groups** (Mosaic and Tigre are real duplicates; two more are old test records) and **23 related groups** (for example Siemens / Siemens Energy, BASF / BASF Agro, WEG and its units). Nothing was merged or changed. | Someone links parents, marks duplicates, and (with your OK) removes the old test records (Banco Itaú Test, Athletico Partner, E2E ...). | Open |
| T10-04 | Known limit | Abhishek | No company has a **CNPJ** yet, so the strongest signal (same legal entity) is unused. Name matching also misses relatives that share no first word, for example "Volvo CE" and "Volvo do Brasil", or "Sicredi Central PR/SP/RJ" and "Sicredi PR/SP/RJ". There is also no **merge tool**: records are only marked, because merging has to move proposals, contacts and emails. | A source for CNPJs; build merge when a person actually needs it. | Open |
| T10-05 | Tech debt | Abhishek | The research agent's tools still save uncited blobs in `full_intelligence` (28 companies), not research records, so those accounts count as directory entries. | Write cited research records from the agent tools as part of Task 12 (research brief). | Open |
| T10-06 | Test gap | Abhishek | The two agent creation paths (competitor discovery, product discovery) were **not run live** because they call the AI and Apify; their duplicate lookup is covered by unit tests only. | Run them once AI spend is back on. | Open |
| T10-07 | Yash | Yash | No screens: stage badge and filter (the Pipeline board still lists all 540 companies), a qualify button with a reason, a research form with citations, the duplicate-review screen, the parent/subsidiary tree. | Design and wire; every action has an API route. | Open |
| T10-08 | Tech debt | Abhishek | Existing drift: `status` and `pipeline_stage` disagree on 9 companies, and the pipeline's own "Qualified" column shares a name with the new "qualified" account stage. | Retire one of the two stage fields. | Open |
| T10-09 | Known limit | Abhishek | The public lead form always writes to the Coritiba tenant, and a matching lead is only marked as a duplicate, never merged. | Tenant routing for public forms (Phase 4). | Open |

### Task 11: multiple opportunities per account (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T11-01 | **Decision** | James | **How were the 138 existing proposals grouped?** One opportunity per company and kind: 73 opportunities (62 cash, 5 barter, 3 incentive, 3 hybrid), 8 companies with more than one. Ten proposals for one company could really be one deal or several. | Confirm the rule, or say how to split (for example by Pipedrive deal). Proposals can be moved one by one in the meantime. | Open |
| T11-02 | **Decision** | Yash / James | Pipedrive still creates **one deal per proposal** (42 deals for 138 proposals). Opportunities have a deal-id column, left empty. | Decide with X-14 whether Pipedrive should get one deal per opportunity. | Open |
| T11-03 | **Data** | James | **One of the two active contracts has no proposal and no company**, so it belongs to no opportunity and cannot be linked. Related to T6-06 and T7-04. | Attach it to its company and proposal, or void it. | Open |
| T11-04 | Yash | Yash | No screens: an opportunities list on the company page, an "open opportunity" button, moving a proposal, close and reopen, and a list of proposals with no opportunity. The Pipeline board is still one card per company (all 540). | Design and wire; every action has an API route. | Open |
| T11-05 | Behaviour | James | A proposal an **agent** generates with no open opportunity stays unattached (it never opens a deal). None exist today, but a review list is needed once agents run in volume. | Decide who reviews unattached proposals. | Open |
| T11-06 | Decision | James | Proposal types for creators, grants and exhibitor packages (nil, grant/ESG, exhibitor) currently map to kind "other". | Say whether they need kinds of their own. | Open |
| T11-07 | Test gap | Abhishek | The AI proposal routes (wizard, generate, generate-for-company, renewal agent) were not run live because they call the AI. The attach code they use was run against the real database through the library, and each route is unit-tested at the call site. | Run one generation per route when AI spend is back on. | Open |

### Task 12: buyer brief and discovery gate (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T12-01 | **Decision** | James | A brief counts for **90 days**, then proposal generation is blocked until a fresh one is written. | Confirm 90 days, or choose another period. | Open |
| T12-02 | **Decision** | James | **Renewals are exempt from the gate**, because they rest on a signed contract. | Confirm, or require a brief for renewals too. | Open |
| T12-03 | **Decision** | James | A **quick brief** (objective, period, point of contact, next action) unlocks generation; the research part (why this sponsor, why this package, cited evidence) is optional. | Say whether some proposal types (national brands, Lei de Incentivo, large deals) must have a full brief. | Open |
| T12-04 | Behaviour | Abhishek | Briefs belong to a **company**, not to an opportunity. A barter deal and a cash deal for the same company reuse one brief although their objectives may differ. The brief table already has an opportunity column, unused. | Link a brief to the opportunity it was written for, once screens exist. | Open |
| T12-05 | Yash | Yash | The brief form is a separate page (`/companies/[id]/brief`); the wizard only shows the refusal in a toast. Still to design: a brief step inside the wizard, gate status on the company page, and the brief level (quick or full) on the proposal and approval card. The brief id is stored on every proposal. | Design and wire. | Open |
| T12-06 | Tech debt | Abhishek | The gate covers the AI generation routes. Proposals made another way (from a template, or duplicated) are not gated. | Decide whether those need a brief too. | Open |
| T12-07 | Known limit | Abhishek | The brief shapes the prompt, but nothing checks that the generated text kept the "unverified" items out of its claims. The unsourced-figure scan (Task 8) only catches numbers. | A check for unverified claims in generated text, with the evaluation gates (Task 30). | Open |
| T12-08 | Deploy | Abhishek | **Every copy of the app needs the new Anthropic key.** The test copy of the app on this box still had the old, disabled key and failed with "organization disabled" until I synced it. Yash's dev setup or any other server copied before 5 Oct may have the same problem. | Check the key in each environment. | Open |

### Task 13: relationship-first playbooks (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T13-01 | **Decision** | James | The default first contact with an account **nobody has qualified is a conversation**, even when a proposal is ready. A person can still choose a pitch (it is recorded). | Confirm this default. | Open |
| T13-02 | **Decision** | James | I added an **introduction** playbook (introduce a club programme) beside conversation and invitation; the task document names only the first two. | Keep it, or drop it. | Open |
| T13-03 | Yash | Yash | No screens: a playbook picker on the company page, the detail field for an invitation or introduction, and the playbook plus override note on the approval card. The Approvals list shows "—" for the company on relationship emails, because it reads the company through the proposal; `emails.company_id` now exists to read instead. | Design and wire; both routes are ready. | Open |
| T13-04 | Behaviour | James | Follow-up emails and the email sequences and warm-up templates (including "Pitch relacional") are not covered by playbooks. A sequence's first step can still be a pitch to an unqualified account. | Decide whether sequences should follow the same first-touch rule. | Open |
| T13-05 | Known limit | Abhishek | "First touch" means no email to the company has been marked sent. Sending only logs to the CRM today (X-10), so the flag is only as true as that. | Real sending (X-10). | Open |
| T13-06 | Data | James | 15 outbound emails (May to August, test recipients) have **no proposal and no company**, and 7 of them sit in the approval queue. | Delete them, with your OK. | Open |
| T13-07 | Account | Abhishek | **Other tenants have no email templates and no default sender**, so they get generic text until set up. All 17 templates belong to Coritiba. | A tenant onboarding step for templates and the sender. | Open |
| T13-08 | Test gap | Abhishek | The introduction playbook and the "first touch flips after a real send" case were not run live (the second needs real sending). Both are unit tested. | Run both once sending works. | Open |

---

## C. Anticipated for tasks not started (to be confirmed when we reach them)

| Task | Likely blocker | Owner |
|---|---|---|
| 14 Contact roles and suppression | Needs a source of truth for do-not-contact (CRM vs here). | Yash / James |
| 15–17 Project types, obligations, dependencies | Depends on the project substrate decision (X-13). | Yash |
| 18 Cash, barter, savings accounting | Needs James's rules: barter valuation, tax treatment, revenue recognition. | James |
| 19, 20 Recap and company statuses | Needs real delivery evidence; Yash's proof screens. | Yash |
| 21 Portal enforcement | Needs Yash's portal shell to test against. | Yash |
| 22 Task source of truth | Blocked on X-13. | Yash |
| 23, 25 Identity and approver recovery | Needs user-lifecycle data (who leaves, when). | James |
| 26–28 Agent governance | Decide whether to adopt LangGraph or Temporal. Task 28 needs a real provider (X-10). | Abhishek |
| 29 Batch cost ceiling | Pairs with Yash's preview screen. | Yash |
| 30 Evaluation gates | Needs fixtures from real commercial edge cases and a budget. | Abhishek / James |
| 31 Langfuse write-up | None. | Abhishek |

---

## D. Cleared so far

| What | Cleared |
|---|---|
| Anthropic organization disabled | 5 Oct: production key replaced, app restarted, verified |
| GitHub Actions CI | 5 Oct: added as the first commit on `abhishek-tasks` |
| Migrations 0052, 0053, 0054 applied | 5–6 Oct: one Supabase project, verified identical across this box, production and Yash's dev |
| Middleware blocked provider callbacks | 6 Oct: allowlisted, with route-level checks |
| Status route let an active contract leave without releasing units | 5 Oct (Task 3) |
| Proposal text editable while still "approved" | 5 Oct (Task 3) |
| Hardcoded club figures with no source on the deck, KPI cards and landing page | 6 Oct (Task 8): now read from the claims registry; unverified figures are not shown |
| Invented "Próximas Partidas" fixtures on the sponsor landing page | 6 Oct (Task 8): removed |
| "Up to 100% of the amount invested" in the incentive-law proposal text | 7 Oct (Task 9): text built from verified claims, no number without one |
| Duplicate agent-created companies from a loose name lookup | 7 Oct (Task 10): one structure-aware check on every creation path |
| Agents able to create sales deals on their own | 7 Oct (Tasks 10, 11): qualification and opportunities need a person or one named rule, enforced in the database |
| Second-person rule tested with only one login | 6 Oct (Task 8, T8-11): tested live with two real logins |
| Agents writing a pitch for a sponsor nobody has spoken to | 7 Oct (Task 12): generation is refused until a person has written a brief, before any AI call is made |
| Email signed with another club's team member | 7 Oct (Task 13): the default sender lookup is now scoped to the tenant; verified on real data |
| Another club's pitch built from Coritiba's email templates (and any template loadable by id across tenants) | 7 Oct (Task 13): all three template lookups are scoped to the tenant; verified on real data |
| An agent pitching an account no person has qualified | 7 Oct (Task 13): refused before any AI call; allowed once a person qualifies it |

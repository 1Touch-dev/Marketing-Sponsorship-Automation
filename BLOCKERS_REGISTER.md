# Blockers and follow-ups register

Started 6 Oct 2026 for Abhishek's numbered tasks (see `Abhishek's tasks 2nd october.md`). **Update this file after every task**, then revisit everything marked Open when the last task is done.

**How to read it**
- **Type:** Decision (someone has to choose), Account (needs a paid account or key), Yash (his side of the work), Test gap (could not be tested live), Tech debt, Security, Deploy.
- **Owner:** who can clear it. James = client side, Yash = colleague, Abhishek = us.
- **Status:** Open / Cleared. Cleared items stay listed so nothing is re-litigated.


**Open items right now: 217** (counted from the tables below; refresh after each task. 195 before tasks 21, 22, 30, 31 and the LangGraph work; those added 23 and cleared 1.)

| Owner | Open |
|---|---|
| Abhishek | 101 |
| James | 73 |
| Yash | 31 |
| Yash / James | 7 |
| James / the club | 3 |
| James / Yash | 1 |
| Abhishek / James | 1 |

| Type | Open |
|---|---|
| Decision | 60 |
| Tech debt | 41 |
| Known limit | 30 |
| Yash | 27 |
| Test gap | 14 |
| Data | 10 |
| Account | 9 |
| Deploy | 7 |
| Security | 7 |
| Content | 6 |
| Behaviour | 5 |
| Removed | 1 |

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

### Task 14: contact standing, do-not-contact and authorized senders (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T14-01 | **Decision** | James | **Contract signature requests and the sponsor-portal login link are not blocked by do-not-contact**, because they are transactional (a signer or a client who asked for access). Outreach, pitches, follow-up sends, the newsletter and agent sends are. | Confirm that split. | Open |
| T14-02 | **Decision** | James | A reply that says "stop emailing me" or "remove me" **puts the address on the list automatically** (logged as the reply sync). Declining a pitch does not. | Confirm, or have it propose the suppression for a person to confirm. | Open |
| T14-03 | **Decision** | James | Only the **current default sender** (Murilo) was authorized when the migration ran. The five other team members, including four test records, are not; until an admin authorizes someone, emails go out signed as "Departamento Comercial". | Say who else should be an authorized sender. | Open |
| T14-04 | Yash | Yash | No screens: a role timeline and "who is the decision-maker" on the company page, channel badges with a verify button, the do-not-contact list with an add and a lift form, the sender authorization admin page, the skipped list after a newsletter, and "signed as" on the email. All have API routes. | Design and wire. | Open |
| T14-05 | Known limit | Yash / James | The list is enforced on **this platform's** sends. It is not synced to Pipedrive or Twenty, and mail sent outside the platform is not covered. | Decide with X-14 which system owns suppression. | Open |
| T14-06 | Known limit | Abhishek | Opt-out detection is **phrase-based** (Portuguese and English): an unusual phrasing or another language is missed. There is also no complaint (spam report) event, so complaints cannot suppress anyone until a real email provider reports them. | A real provider (X-10); review missed cases. | Open |
| T14-07 | Test gap | Abhishek | The reply-sync hook was not run live because it needs Gmail. Its detection and the suppression it writes were run against the database. | Run once Gmail is connected to a test inbox. | Open |
| T14-08 | Tech debt | Abhishek | The **follow-up draft route** does not check the recipient (its send is gated, so nothing reaches a suppressed person). The email sequence runner calls the generate endpoint over HTTP with no credentials, so it cannot work as written; it has no enrollments. | Add the check to follow-up drafting; fix or retire the runner. | Open |
| T14-09 | Known limit | Abhishek | Authorization applies to the **person an email is signed as**, not to the user who clicks send, and platform users are not linked to team members. All emails go out from one Gmail address (none uses a sender profile). | Link users to team members when the real provider and sender addresses exist. | Open |
| T14-10 | Data | James | None of the 22 contacts has a role or a verified address, and 4 team members are test records. | Fill in roles; delete the test members and the other test data with your OK. | Open |


### Task 15: commercial vs delivery projects (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T15-01 | **Decision** | James | Starting a delivery project on a contract whose signature is only claimed (no evidence recorded, see T6-02) is **allowed with a warning**. It could instead be refused until the signature is proven. | Choose: warn (current) or refuse. | Open |
| T15-02 | **Decision** | James | Completion rules as built. Sales project: the deal must be won, lost or closed, and the outcome written (10+ characters). Delivery project: contract active, completed or expired, every delivery task done, and the period over (or a written reason for ending early). | Confirm, or change what counts as finished. | Open |
| T15-03 | Yash | Yash | No screens: project list and detail per type, the required fields per type (from `/api/projects/types`), the start / pause / resume / complete / cancel buttons with the reason boxes, and the blocker list that explains why a project cannot be completed. All have API routes. | Design and wire. | Open |
| T15-04 | **Decision** | Yash / James | Each project can carry a pointer to an outside task system (system name and id, unique). Nothing reads or writes that system yet. | Settle X-13 (which system runs day-to-day tasks); then sync. | Open |
| T15-08 | Known limit | Abhishek | An active contract with no proposal behind it (T11-03) has no task list, so its delivery project can only complete when the period ends. | Link the contract to its proposal, or give it obligations (see T16-06). | Open |


### Task 16: contract-to-obligation handoff (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T16-01 | **Decision** | James | The handoff runs when a contract is created and active, **not when its signature is proven**. If the signature is only claimed it goes ahead and warns (same choice as T15-01). It could instead wait for proof. | Choose: warn (current) or hold the handoff until the signature is proven. | Open |
| T16-02 | **Decision** | James | Due-date rules as built: the four onboarding steps fall due **7 or 14 days after the contract starts**, and every sold item is due **on the contract end date**, because an allocation has no dates of its own. | Confirm, or give a schedule per item (for example by match or by month) so deliverables are dated individually. | Open |
| T16-03 | **Decision** | James | Default owner: the opportunity's owner, else the person who triggers the handoff, else an active admin. Anyone can be reassigned afterwards. | Name a delivery manager if one person should own delivery work by default. | Open |
| T16-04 | **Decision** | James | **Acceptance** needs a person other than the one who recorded the delivery (the database enforces it). A delivered item with proof counts as finished for the project; acceptance is not required for that. A one-person team cannot accept its own work. | Confirm both rules, and whether sponsor acceptance (portal, Task 21) should replace the internal one. | Open |
| T16-05 | Yash | Yash | No screens: obligations by owner and due date, one obligation with its history and a proof form, the "contracts with no obligations" gap list, and a "run handoff" button. All have API routes. The proposal page and portal still show the old checklist, now rebuilt from obligations. | Design and wire. | Open |
| T16-06 | Data | Abhishek | The **two real active contracts have no obligations**. One has no company (T11-03) so it cannot be handed off; the other has a proposal with 9 old tasks (1 done) and no recorded allocations. Nothing was converted automatically. | With your OK, link the first to a company and run the handoff on both. | Open |
| T16-07 | Known limit | Abhishek | Proof is a web link, a file link or a written statement. Links are **not checked to be reachable**, a statement is only a person's word (shown as "stated", not "attached"), and proof is not stored in the contract's signature ledger. | Add file upload and link checks with the proof screens (Task 19). | Open |
| T16-08 | Tech debt | Abhishek | The old checklist generator (Task 10) stays as a fallback for installs where migration 0064 is missing, and the checklist inside the proposal is overwritten from obligations after every change. | Remove the fallback once every environment has 0064. | Open |


### Task 17: dependencies and date-change impact (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T17-01 | **Decision** | James | The handoff sets a **default order of work**: billing and kickoff wait on the signed contract, the season calendar waits on kickoff, and every sold item waits on the calendar. A person can add or end any dependency afterwards. | Confirm the default, or give the real order your delivery team follows. | Open |
| T17-02 | **Decision** | James | When a date moves, the downstream work and its owners are **shown and recorded**, but **nobody is notified**. No Slack or email message is sent. | Say who should be told when a date moves, and how (Slack channel, email to the owner, or the owner's task list only). | Open |
| T17-03 | **Decision** | James | A move past the contract end or the delivery period needs only the mover's acknowledgement and a reason. It does not need a second person, and it does not change the contract. | Decide whether such a move needs approval or a contract amendment. | Open |
| T17-04 | Yash | Yash | No screens: an impact preview before a date is moved (work that waits, owners, conflicts, a cascade choice), the dependency list with add and end, a date history on each obligation and project, and a "moved" badge. All have API routes. | Design and wire. | Open |
| T17-05 | Known limit | Abhishek | **A contract's own start and end dates are not covered.** Changing them does not move any obligation or project; dates move only through an obligation or a project. A sold item still has no date of its own (T16-02), so match-day or calendar-driven dates are not modelled. | Decide how contract date changes should ripple; add item-level dates with the T16-02 answer. | Open |
| T17-06 | Known limit | Abhishek | Dependencies are "finish to start" only, link obligations of **one contract**, and do not connect a project to an obligation or one contract to another. | Extend if James's team needs cross-contract or start-to-start links. | Open |


### Task 18: cash, barter and savings accounting (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T18-01 | **Decision** | James | **When does cash count as revenue?** The rule is a setting; until a person sets it the safe default is **only once received**. The other choices are when the contract is in force, or when invoiced. A draft or lapsed deal never counts under any of them. | Choose: contracted, invoiced or received (`PATCH /api/finance/settings`, admin). | Open |
| T18-02 | **Decision** | James | **How is barter valued?** At the **agreed value** with the sponsor (default), or at the **club reference value** (what the club would otherwise pay). Barter received without a reference value is left out under the second choice and listed. | Choose the basis, and say where the reference value comes from (a quote, the wishlist price, finance). | Open |
| T18-03 | **Decision** | James | Does a contract's **total value include barter goods**? The default says yes, so the "Contracted value" and "Total revenue" cards on the dashboard and reports can include goods as well as money. The cash split exists now; those cards have not been switched. | Confirm what the total means; then those cards can read cash recognised instead. | Open |
| T18-04 | **Decision** | James | **Tax treatment of barter.** Nothing is calculated: the settings hold a free-text note only. | Give the rule (tax, invoicing of goods, whether barter is taxed at the agreed or reference value), or point the club's accountant to it. | Open |
| T18-05 | **Decision** | James | Money from the **incentive law** (3 incentive-type deals exist) is recorded as ordinary cash. | Say whether it needs its own line type and its own recognition rule. | Open |
| T18-06 | **Decision** | James | Only an **admin** can record an invoice, a receipt or a void, and one person can do it alone. | Say who should record receipts, and whether a second person must confirm them. | Open |
| T18-07 | Yash | Yash | No screens: a finance summary page, cash and barter lines on the proposal and contract pages with their invoiced, received and voided history, the accounting settings form, and the reconciliation and gap lists. The dashboard and reports "revenue" cards still read contracted value. All have API routes. | Design and wire; switch the revenue cards when T18-03 is settled. | Open |
| T18-08 | Data | James | **No money is recorded anywhere yet.** The two real active contracts have no total value and no lines, and the one real barter wishlist item is not linked to anything. The platform shows zero, not an estimate. | Give the instalments and barter terms of the real contracts, with your OK to enter them. | Open |
| T18-09 | Known limit | Abhishek | **BRL only** (no currency conversion). Lines are entered by hand, not generated from a proposal's package price. Receiving barter does not mark the wishlist item as obtained. There are **no refunds or credit notes**: a line can be voided only before anything is received. | Extend when a second currency, instalment plans or refunds are needed. | Open |


### Task 19: sponsor recap reconciliation (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T19-01 | **Decision** | James | **What makes a recap "complete"?** As built: after the contract ends, nothing overdue and nothing marked delivered without proof. Other gaps (not yet accepted, reach not recorded, signature not proven, no money recorded) are listed but do not stop a recap being called complete. | Confirm, or say which of those gaps should also hold it back. | Open |
| T19-02 | **Decision** | James | **How strong a renewal case needs to be before an agent drafts one.** As built: a strong case is 90% or more of commitments delivered with proof, no blocking gap and at least one measured result; a supported case is 50% or more; below that **the renewal agent writes nothing and makes no AI call**. A person can still write the renewal by hand. | Confirm the thresholds, or allow a draft anyway with a warning. | Open |
| T19-03 | **Decision** | James | Who may **issue** a recap: an admin or an approver. Issuing records an immutable numbered version with its gaps and the issuer's written acknowledgement; **it does not send anything** to the sponsor. | Confirm who issues, and whether issuing should also notify the sponsor (needs the portal, Task 21, or the email provider, X-10). | Open |
| T19-04 | Yash | Yash | No screens: the recap per contract (the funnel from sold to accepted, the gap list with what fixes each, measured and modeled in visibly separate panels), an issue dialog asking for the acknowledgement, and the list of issued versions. A sponsor-facing recap needs the portal (Task 21). All have API routes. | Design and wire. | Open |
| T19-05 | Data | James | **No match or reach is recorded at all** (0 matches, 0 reach rows), so every real recap would say it has no outcome data. Reach counts only with a stated source. | Name who records reach per match, and the source to cite (analytics export, broadcaster report). | Open |
| T19-06 | Known limit | Abhishek | Delivery is yes or no: **partial delivery** (18 of 25 home matches) is not tracked. Measured results are reach only; leads, sales and engagement are not. Reach is attributed to a contract by its date range, not to individual items. | Add counted delivery and other result types when James names them. | Open |
| T19-07 | Known limit | Abhishek | The monthly **Reporting Agent** (sponsor report emails from reach) is unchanged: it does not yet carry the recap's gaps. Estimates inside a proposal's own text are checked by the claims scanner (Task 8), not listed in the recap; only strategy reach estimates are. | Feed the recap into the report emails when the email provider exists. | Open |


### Task 20: company page statuses (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T20-01 | **Decision** | James | **What each status means.** A company takes the **least advanced** status of its contracts in force. *Promised*: a contract is in force but nothing is scheduled. *Scheduled*: owned, dated obligations exist and some are undelivered. *Delivered*: everything due is marked delivered. *Evidence accepted*: everything due is delivered with proof a second person accepted. Waived items are set aside. | Confirm the meanings, or change what counts as "delivered" or "accepted". | Open |
| T20-02 | **Decision** | James | **What counts as "at risk".** Eight named reasons, ranked: overdue work, delivery without proof, an ended contract not proven, a renewal with under half proven, work never scheduled, dates in conflict, a project on hold, and an **unproven signature**. The last is low severity but counts, so every contract without signature evidence (both real ones) shows its account at risk. | Confirm the list, or drop the signature from "at risk". | Open |
| T20-03 | **Decision** | James | **Nobody is told** when a company becomes at risk. It is visible and recorded, but no Slack or email message is sent. | Say who should be notified, and how. | Open |
| T20-04 | Yash | Yash | No screens: a status chip with its definition on the company page, the risk list with what fixes each, the contracts behind it, the history with "since", a status and risk filter on the companies list, and the opportunities shown beside the delivery status. All have API routes. | Design and wire. | Open |
| T20-05 | Tech debt | Abhishek | The status is always correct when read, but its **history is only written when something changes it** (an action) or when the refresh endpoint is called. **No daily job calls it**, so a status that changes only because a date passed is logged late. Each delivery and proof step also writes its own row, which makes the log detailed rather than short. | Schedule the refresh daily (needs the scheduler set up); decide whether to collapse bursts. | Open |
| T20-06 | Known limit | Abhishek | The delivery status is about delivery only. The relationship stage (Task 10) and the opportunities (Task 11) stay separate fields, and a company with opportunities but no contract in force reads "no commitments". The status is not synced to Pipedrive. | Decide with X-14 whether any of it should be written to the CRM. | Open |

---

### Task 23: effective identity and an immutable audit trail (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T23-01 | Known limit | Abhishek | **1,241 earlier audit entries have no recorded actor.** They are kept, numbered and chained, and marked `legacy`; who did them cannot be recovered. Every entry since 8 Oct names its actor (person, approver, agent with its version, service, or outside party). | Nothing to do; the share of attributed entries is visible at `/api/audit/attribution`. | Open |
| T23-02 | **Decision** | James | **Immutable log versus erasure on request (LGPD).** The audit log can no longer be edited or deleted, by design. Lead details were moved out of it into an erasable table (`proposal_interests`), and tokens, links and IPs were replaced by fingerprints. Entries still hold people's emails (as actors, and as the subject of some events). Whether that is acceptable, or entries must be pseudonymised on request, is a policy choice. | Decide the retention and erasure rule; if erasure is needed, we add a controlled pseudonymise step that is itself logged. | Open |
| T23-03 | **Security** | Abhishek | **The unsubscribe route does not unsubscribe.** `/api/newsletter/unsubscribe` only writes a log line: it ignores its token, does not add the address to the suppression list, and used an invalid id in its audit entry. Found while checking what is audited; not changed in this task. | Make it verify the token and add a suppression (Task 14's list), with a test. | Open |
| T23-04 | **Security** | Abhishek | **The chain is tamper-evident, not tamper-proof.** Anyone who owns the database can disable the triggers and rewrite the log and its hashes together. Verification (`/api/audit/verify`) catches changes made without doing that. | Decide whether to export a daily head hash somewhere the database owner cannot reach. | Open |
| T23-05 | Tech debt | Abhishek | The chain is verified only when someone calls `/api/audit/verify`. Nothing checks it on a schedule or alerts. | Schedule it with the other jobs (see T20-05, T25-01). | Open |
| T23-06 | Yash | Yash | No screens for who did what: the audit page does not show the actor kind or the agent version, there is no 'chain intact' indicator, and no coverage view. All three have API routes. | Design and wire. | Open |
| T23-07 | Known limit | Abhishek | **Audit entries written by routes that passed a `performed_by` were silently lost before 8 Oct**: that column points at the old `users` table, so every such write failed its foreign key and the failure was only logged. Fixed in the writer. The lost entries (email status changes, campaign status changes, enrichment) cannot be reconstructed. | Nothing to do. | Open |

---

### Task 24: tombstones, idempotency and stable external references (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T24-01 | **Decision** | James | **Deleted records keep a full copy, including personal data, with no expiry.** A tombstone is what makes a delete undoable, so it holds contacts' names and emails too, and tombstones cannot be deleted. There is no erasure path and no retention period. | Decide how long a deletion can be undone (for example 90 days), and whether an erasure request must also purge tombstones; we then add a logged purge. | Open |
| T24-02 | Yash | Yash | **Delete buttons must send a reason.** Deleting a record that work depends on (a company with a contract in force, obligations or recaps) now returns 409 until the call sends `confirm=true` and a reason of 10+ characters. Existing delete buttons do not, so they will show an error for those records. There is also no screen to list deleted records or undo one. | Add the confirmation dialog (it should list the `blockers` and `dependents` the 409 returns) and a deleted-records page with Undo. | Open |
| T24-03 | Known limit | Abhishek | An undo is refused as a whole, and changes nothing, when it cannot be exact: a record with one of the same IDs exists again, or something it needs was deleted separately. A link that someone has set since the delete is left alone. | Nothing to do; the refusal says why. | Open |
| T24-04 | Known limit | Abhishek | Tombstones cover the 16 core tables and everything they cascade into (about 30 more). A direct delete in some other table, for example one `emails` row, leaves no snapshot. A delete that would unlink more than 5,000 records is refused rather than made impossible to undo. | Add tables to the list if they become deletable from the screens. | Open |
| T24-05 | Tech debt | Abhishek | Idempotency keys cover 30 create/approve POST routes. Keys last 24 hours and the purge function is not scheduled. Clients must send the `Idempotency-Key` header; none do yet. | Schedule the purge; have the screens send a key on create and approve buttons (double-click protection). | Open |
| T24-06 | Yash | Yash | The screens do not send an `Idempotency-Key`, so a double-click still creates two records (the company duplicate check catches only companies). | Generate a key per button press. | Open |
| T24-07 | **Decision** | Yash / James | **Who owns which field when a CRM and the platform both edit a record.** The ownership registry and the stable ID links (`external_refs`) exist, and nothing uses them yet: the Pipedrive sync does not read or write them. | Decide field ownership per system with X-13/X-14, then wire the sync. | Open |
| T24-08 | Known limit | Abhishek | Replaying an idempotent request returns the stored answer with its JSON keys in a different order. Same content. | Nothing to do. | Open |

---

### Task 25: approver recovery (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T25-01 | Tech debt | Abhishek | **No schedule.** A blocked approval is found when a user is deactivated or their role changes, and when someone calls `/api/approvals/recovery/scan`. An approval that simply waits past its 2-day review deadline is found only when that scan is run. The same is true of the stuck-action sweep (T28-02). | Schedule both daily with the scheduler (the same job as T20-05). | Open |
| T25-02 | **Decision** | James | **Nobody is told when an approval is blocked**, and the 2-day deadline is a default. If no active administrator exists, the scan reports that it cannot escalate and nothing else happens. | Say who is told, how (Slack, email) and the review deadline. | Open |
| T25-03 | Yash | Yash | No screen for blocked approvals (who they were waiting for, why, who to reassign to). | Design and wire to `/api/approvals/blocked`. | Open |

---

### Tasks 26 and 27: agent definitions, versions, assignments and plans (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T26-01 | **Decision** | James | **Six agents are 'grandfathered' with authority over every company** in the first tenant, so nothing changed on day one. Their authority is now written down and can be narrowed or revoked. | Decide which agents should be limited to some companies or campaigns. | Open |
| T26-02 | Behaviour | Abhishek | **A new tenant starts with no agents, and every agent is refused there until installed.** `POST /api/agent-registry/install-standard` installs the six (optionally assigned workspace-wide). Tenant creation does not call it yet. | Call it from tenant onboarding. | Open |
| T26-03 | Known limit | Abhishek | **Promoting a new agent version cancels every plan still waiting for approval under the old one** (they fail at approval with the reason). Intended, but an administrator should know. | Show a warning on the promote screen. | Open |
| T26-04 | Known limit | Abhishek | Promotion 'evidence' is free text. It is required and recorded, but nothing checks it. Task 30's evaluation gates are meant to make it checkable. | Link promotion to a passing evaluation run in Task 30. | Open |
| T26-05 | Tech debt | Abhishek | **Only sending an email is a planned, approved action.** Other effects (paid enrichment, research, drafting, CRM notes) are authorised by assignment and scope, and limited by cost, but have no plan or approval step. | Decide if enrichment or CRM writes also need approval. | Open |
| T26-06 | Yash | Yash | No screens for the agent registry, versions, assignments, or the plan an approver reads before approving (what it will do, to whom, at what cost, what stops it). All have API routes. | Design and wire. | Open |

---

### Task 28: durable action state (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T28-01 | Test gap | Yash / James | **No real email provider (X-10).** 'Provider accepted' is today: the email is marked sent and logged to the CRM, and the recipient is not emailed by the platform. A send that is marked sent but whose CRM write fails is recorded as unknown, not as success. With no Pipedrive key on this box every live send ended there. The fully successful path is covered by the database tests, not by a live run. | Provide the provider and a Pipedrive key, then run one live send. | Open |
| T28-02 | Tech debt | Abhishek | The sweeper that marks a stuck 'executing' action as unknown runs only when called (`/api/agent-actions/sweep`). | Schedule it (see T25-01). | Open |
| T28-03 | **Decision** | Abhishek | **(Cleared 8 Oct: LangGraph.js is now wired; see the LangGraph section.)** ~~LangGraph.js is not wired in yet.~~ The durable state machine lives in Postgres and does not depend on any agent framework, as agreed. The existing agents still run on their current orchestrator; moving them onto LangGraph graphs that use this state is not done. | Decide whether to port the agents now or after Tasks 30 and 31. | Cleared |

---

### Task 29: batch review limits and cost ceiling (done)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T29-01 | **Decision** | James | **Default limits are a guess:** 10 items per batch and US$5 per batch. The cost per item (outreach $0.25, campaign $0.15, proposal $0.15, image $0.20) are estimates, not measured. | Choose the limits; we calibrate the estimates from the spend ledger. | Open |
| T29-02 | Known limit | Abhishek | The ceiling is checked before a batch starts; it does not stop a batch that costs more than estimated while running. The daily spend cap still does that. Applied to the outreach batch and campaign bulk routes; other bulk paths (imports, image jobs) are not gated. | Gate the others if they become heavy. | Open |
| T29-03 | Yash | Yash | No preview screen showing the estimate and limits before launching a batch. | Wire to `/api/batch/limits` and the refusal fields. | Open |

---

### LangGraph runtime, Tasks 21, 22, 30 and 31 (done 8 Oct, migration 0072)

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| LG-01 | Tech debt | Abhishek | **No retention for saved run steps.** Every step stores the full state in `langgraph_checkpoints`/`langgraph_writes`; nothing is ever pruned. | Decide how long a finished run's steps are kept, then add a prune job. | Open |
| LG-02 | Tech debt | Abhishek | The earlier orchestrator (`orchestrator-legacy.ts`, `resume-legacy.ts`) is kept as a fallback for when 0072 is not applied. | Remove it after 0072 has been live for a release. | Open |
| LG-03 | Tech debt | Abhishek | The sweeper for stuck runs (`/api/agent-graphs/sweep`) runs only when called. | Schedule it with the other sweeps (T25-01, T28-02). | Open |
| LG-04 | Known limit | Abhishek | A crash in the middle of a step is proven by the real-Postgres tests (a step that dies is redone, finished steps are not), and a new server process was shown reading and cancelling a run an older process left waiting. A process was not killed mid-model-call on the live system. | Run a kill-during-run drill when there is a staging box. | Open |
| LG-05 | Known limit | Abhishek | A run that ends on a rule (for example "nobody qualified this account") is recorded as failed and cannot be carried on; start a new run once the cause is fixed. Only a crash can be carried on. | None needed; stated so nobody expects otherwise. | Open |
| LG-06 | **Decision** | Abhishek / James | **The manual `/api/emails/[id]/send` route does not go through the action broker.** A person with `send_proposal` can approve an agent-drafted email or mark it sent without a send plan. Found 8 Oct; only the clear case is closed now (a *cancelled* plan refuses). | Decide whether agent-drafted emails must always use the plan, then make this route enforce it. | Open |
| LG-07 | Known limit | Abhishek | Cancelling a run withdraws its send plan, but the draft email stays in `pending_approval` as a dead item. | Mark the draft rejected when its plan is withdrawn. | Open |
| LG-08 | Tech debt | Abhishek | New tenants have no agents until `install-standard` is called; nothing calls it on onboarding. | Call it from tenant creation. | Open |
| T21-01 | Yash | Yash | No sponsor-portal screens beyond the sign-in and a minimal dashboard, and no screen for staff to end a contact's access (`POST /api/portal-admin/revoke` exists). | Build to the routes. | Open |
| T21-02 | **Decision** | James | **Ending access ends sessions issued before it.** A contact still on file can ask for a new link and get back in. Removing the contact stops that. | Decide whether revoking should also block new links. | Open |
| T21-03 | Tech debt | Abhishek | One secret (`INTERNAL_API_SECRET`) signs magic links and portal sessions; there is no rotation plan. | Add a rotation plan. | Open |
| T22-01 | **Decision** | Yash | **X-13: which task tool** (Pipedrive Projects, Plane, or none). Until chosen `TASK_SOURCE_SYSTEM=none` and nothing syncs. | Choose; then write the adapter (see `docs/TASK_SOURCE_HANDOVER_FOR_YASH.md`). | Open |
| T22-02 | Yash | Yash | No inbox screen for what the outside tool reports (apply a completion, dismiss). Routes exist. | Build the screen. | Open |
| T22-03 | Test gap | Yash | Only the in-memory adapter and the contract suite have run. A real adapter must pass the same suite against a sandbox project of the real tool. | Run `adapterContractCases` against it. | Open |
| T22-04 | Tech debt | Abhishek | Push and pull are not scheduled; the first push sends every in-force deliverable. | Schedule them; decide backfill (all history or open items only). | Open |
| T30-01 | **Decision** | James | **Budget and limits are mine.** US$15 per 30 days in total, US$4 per run. About US$0.45 buys a full negotiation evaluation. | Confirm or change `EVAL_TOTAL_BUDGET_USD` / `EVAL_RUN_BUDGET_USD`. | Open |
| T30-02 | Known limit | Abhishek | **Two spend records.** The app's budget counts evaluations run through it (US$0.07 so far). Runs from the command line (`eval:local`, about US$6.64 of development spend) are in `.eval-spend.json` and the provider's bill, not in the app's budget. The real total is higher than the app shows. | Count command-line runs in the ledger, or stop using them. | Open |
| T30-03 | Known limit | Abhishek | Model cases exist for negotiation, proposals, renewal and report only. Pipeline hygiene (plain code) has none, so it can only go live with a written override. A handful of cases per agent, not a statistical guarantee. | Add a fixture whenever production shows a new failure. | Open |
| T30-04 | Tech debt | Abhishek | The evidence checker exists but is not wired into research: nothing fetches a cited page and checks the quote. | Wire it in when research is reworked. | Open |
| T30-05 | Tech debt | Abhishek | The agent versions installed by `install-standard` went live as "standard catalog" without an evaluation. Only reporting-agent v2 (a scratch tenant) has a recorded run. | Evaluate each live version for the real club and accept baselines. | Open |
| T30-06 | Known limit | Abhishek | Cost reference is tokens per case, not money; a model change that cuts tokens but raises price per token is not seen. Editing any prompt invalidates earlier evaluations. | None needed. | Open |
| T31-01 | **Decision** | James | **Langfuse hosting and capture level.** Cloud at `redacted`, self-hosted, or off. Until decided leave it off or use `metadata`. | Decide; then set the keys. | Open |
| T31-02 | Test gap | Abhishek | No Langfuse instance exists, so tracing was proven with a fake client (spans, generations, redaction, never throws), not against a live one. | Provision keys and look at one real trace. | Open |

---

### Housekeeping found on 8 Oct

| ID | Type | Owner | Blocker | What clears it | Status |
|---|---|---|---|---|---|
| T23-08 | Tech debt | Abhishek | `tests/openai-renderer.test.ts` expects an `input_fidelity` field that `gpt-image-2` deliberately does not get (commit 6a86a01). The `jersey-pipeline` suite has failed since then. Not related to these tasks. | Update the test to the current behaviour. | Open |

---

## C. Anticipated for tasks not started

All numbered tasks (1 to 31) are done; nothing is anticipated.


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
| No way to tell a sales project from a delivery project, or to see what finishes each | 7 Oct (Task 15): two project types with their own required fields and completion checks, enforced in the database; status derived from an append-only event history |
| A deleted proposal could be blocked by a project pointing at it | 7 Oct (Task 15): caught in testing, guard fixed and re-verified |
| A signed commitment ended as a loose, unowned, undated checklist inside the proposal | 7 Oct (Task 16): every sold item and onboarding step becomes an owned, dated obligation linked to its allocation, with proof recorded and a project that finishes on proof |
| Delivery projects created by hand, and completed on a ticked box | 7 Oct (Task 16): created by the handoff; completion needs proof (T15-05 and T15-06 cleared) |
| Company status inferred from scattered fields, with nothing saying why an account is in trouble | 7 Oct (Task 20): one derived status per company (promised, scheduled, delivered, evidence accepted) plus an at-risk flag that always carries named, ranked reasons and what fixes each; every change is logged with what caused it |
| A sponsor told about results nobody measured; a renewal pitched on enthusiasm, not on proven delivery | 7 Oct (Task 19): measured results need a stated source and stay apart from modeled estimates (enforced in the database); every missing proof is a named gap; a renewal is drafted only from the reconciled recap, and with no proven delivery no AI call is made |
| Barter value able to read as revenue, and a draft deal able to be counted as money; no split of a contract's one number | 7 Oct (Task 18): cash, barter and savings kept apart and never summed; drafts and proposals refused as revenue in the database; a proposed line becomes contracted as the same row (the rules James has not chosen are settings with conservative defaults, see T18-01 to T18-06) |
| A date moved with one silent field update: no record, no view of what depended on it | 7 Oct (Task 17): every move is a recorded, reasoned, attributed change with the downstream work and owners it affected; a conflicting move is refused unless acknowledged (T15-07 and T16-09 cleared) |
| Any signed-in user could write any audit entry, for any tenant | 8 Oct (Task 23): the insert policy was removed; verified live that a signed-in administrator's forged insert is refused, for their own tenant and another |
| Credentials and personal data in the audit log (sign-in links, share tokens, email IPs, lead details) | 8 Oct (Task 23): moved or fingerprinted before the log was sealed; verified on the 1,241 real rows |
| Audit entries that named no one, or could be edited or deleted | 8 Oct (Task 23): every entry names its actor; edits, deletes and truncation are refused; the chain verifies on all 1,241 earlier rows and every new one |
| User role changes, deactivation and removal were not audited, and `/api/audit` was open to any signed-in user | 8 Oct (Task 23): audited, and the log is limited to people who may view audit |
| Deleting a company silently detached its in-force contracts, emails and threads, and cascaded into about 30 tables with no copy | 8 Oct (Task 24, found in the live test): every cascaded row is kept, what was unlinked is recorded, and an undo restored the real company, contract, obligations, events (same timestamps and actors), project, proposal, research and email links, identical to before the delete |
| A retried request did the work twice | 8 Oct (Task 24): same key, same answer; a different request under a used key is refused |
| Anyone with an agent run could send, with no record of what was approved | 8 Oct (Tasks 26–28): sending is a sealed plan that a person with standing approves; the approver's standing is rechecked when it runs; a plan cannot be edited; a send of unknown outcome is never repeated |
| An approval stuck on someone who left | 8 Oct (Task 25): blocked with a reason and an escalation, recoverable by an administrator |
| A bulk job with no limit on size or cost | 8 Oct (Task 29): refused before anything starts, and recorded; verified that nothing was spent |
| Emails drafted or sent to people who asked us to stop, or to dead addresses | 7 Oct (Task 14): refused at every draft and send point, before any AI call; a failure to check also refuses |
| A named team member signing emails without being authorized | 7 Oct (Task 14): signing is limited to authorized senders; revocation blocks already drafted emails |
| Found and fixed by the live tests on 8 Oct (tasks 21–31): unauthenticated `/api/exports`, `/api/system/health` and `/api/system/status`; internal cost (`execution_brief`) shown to sponsors; draft proposals visible in the portal; negotiation agent forwarding to a stranger's address and obeying planted orders; proposal agent repeating invented "verified" figures; report agent inventing a contact; an email changed after approval not being noticed; an approval flag left open after a legitimate transition; the portal returning database error text for a bad id; a cancelled run leaving its send plan approvable; a cancelled send plan reversible through the manual route | 8 Oct |

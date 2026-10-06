# Blockers and follow-ups register

Started 6 Oct 2026 for Abhishek's numbered tasks (see `Abhishek's tasks 2nd october.md`). **Update this file after every task**, then revisit everything marked Open when the last task is done.

**How to read it**
- **Type:** Decision (someone has to choose), Account (needs a paid account or key), Yash (his side of the work), Test gap (could not be tested live), Tech debt, Security, Deploy.
- **Owner:** who can clear it. James = client side, Yash = colleague, Abhishek = us.
- **Status:** Open / Cleared. Cleared items stay listed so nothing is re-litigated.

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

---

## C. Anticipated for tasks not started (to be confirmed when we reach them)

| Task | Likely blocker | Owner |
|---|---|---|
| 7 Canonical metrics | None expected. Needs agreed metric definitions from James. | James |
| 8, 9 Claim registry and club-facts content | Needs real, current source material and a named content owner; the 9th needs the actual correct facts. | James / the club |
| 10, 11 Company stages, multiple opportunities | Interacts with the CRM direction (X-14); Pipedrive deals are the current canonical opportunity. | Yash / James |
| 12 Research brief and discovery gate | Spends AI; needs a decision on what the gate must contain before generation. | James |
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

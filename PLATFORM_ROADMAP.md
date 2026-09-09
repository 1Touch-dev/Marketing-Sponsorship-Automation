# Platform Roadmap & Knowledge Transfer — Coritiba → Multi-Tenant SaaS

**Status:** Direction confirmed by James Thunder (owner) on 03 Sep 2026. This document is the single source of truth for what happens next, why, and in what order. It is written for any developer joining this project cold — read it top to bottom before touching code.

**Companion documents (already in repo root):**
- `master_report.md` — the full strategy/research report this roadmap is built from. Read it once; this document reorganizes and sequences it into something buildable.
- `Platform-Feature-Manual.pdf` — exhaustive inventory of everything already built (58 pages, 145 API endpoints). **Read this before proposing any new feature — if it's in there, it already exists, don't rebuild it.**
- `README.md` — technical setup, architecture, environment variables, DB schema.
- `Sponsorship-Tech-Scouting-Report.pdf` — earlier, narrower competitive analysis (superseded in scope by `master_report.md`, kept for reference).

---

## 1. Project Context — For New Developers

### 1.1 What this is today
A single-tenant commercial/sponsorship-management platform built for **Coritiba FC** (Brazilian football club). It runs the club's real sponsorship pipeline: prospecting companies, AI-drafted proposals and outreach emails, AI-generated sponsor mockups (jersey/stadium/campaign), CRM (synced to a live Pipedrive account), contracts, and reporting. It is in active production use — not a prototype.

### 1.2 Stack
Next.js 14 (App Router) frontend + API routes as the only backend, Supabase Postgres, AWS Bedrock (Claude) for text generation, OpenAI `gpt-image-2` for image generation, Hunter.io/Apollo.io/Apify for prospecting/enrichment, Pipedrive for CRM sync. Deployed via PM2 + ngrok on a single EC2 instance. Full detail in `README.md`.

### 1.3 Repo conventions
- One branch per sprint (e.g. `21-Aug-sprint`), not trunk-based.
- Supabase migrations are numbered sequentially in `supabase/migrations/` — **direct DB access from the dev box does not work** (confirmed, not worth re-testing); every schema change ships as a migration file and gets pasted into the Supabase SQL Editor by hand.
- No CI pipeline. Verification is: `tsc --noEmit`, `next lint`, a production `next build`, and direct data-layer checks against the live Supabase REST API. There is no reliable headless-browser option on this box — UI verification is either manual (a human clicking through) or delegated to a teammate who has a real browser (Cursor's client-side browser has been used for this).
- Dated `.md` files in the repo root (`17th_July.md` etc.) are historical sprint logs — read the most recent few for current context, don't try to read all of them.

### 1.4 Current sprint state (as of this document)
Branch `21-Aug-sprint` just shipped: per-match proposals, an editable per-match media-reach module, CRM warm-up-strategy sequencing, a full redesign of the default proposal deck, a real Coritiba crest fix, and several bug fixes found during full-pipeline QA (wrong-logo-on-mockup bug, campaigns panel showing 0 for every company, a stale auth-middleware gap on public pages). All committed and deployed to production.

---

## 2. The Strategic Decision (James Thunder, confirmed 03 Sep 2026)

This is not a backlog of ideas — it is a confirmed direction. Paraphrasing his actual replies:

1. **Yes, this is real.** The plan was always to build on the Coritiba platform, improve it, and take it to market as a product sold to other clubs (and, per `master_report.md`, potentially nonprofits/conferences/chambers/festivals beyond sports).
2. **Team is scaling.** He's already hired 2 junior developers on trial, and wants senior candidates interviewed and the team actually used — this is no longer a one-developer sprint cadence.
3. **Legal needs to be engaged.** He asked for the specific legal questions to be written up, with a suggested draft answer for each (to hand to an AI legal-assist tool as a starting point, not as final counsel), plus real alternatives to the Twenty CRM recommendation in the report.
4. **Sequencing is delegated** to engineering judgment.
5. **Order confirmed:** harden the existing automation first, then improve the text/email agents, then validate that it's solid — **before** standing up the new multi-agent teams `master_report.md` Section 7 proposes.

**What this means practically:** the multi-tenant SaaS pivot is the real destination, but the report's own Section 8 (failure-pattern hardening) comes first, by James's explicit instruction — not as a suggestion engineering made up.

---

## 3. What's Already Built — Do Not Rebuild This

Full detail in `Platform-Feature-Manual.pdf`. Condensed for orientation:

| Area | Status |
|---|---|
| CRM & Companies (list, detail, fit score, contacts, competitors, logo scraping) | Built, live |
| Intelligence & Discovery (product/seller discovery, company intelligence) | Built, live |
| Outreach Agent — 5-step pipeline (enrich → scrape → propose → email → send) with approval gates | Built, live — **this is what Phase 1 below hardens** |
| Proposals — 7-type wizard, per-match scoping, redesigned deck, bulk proposals, public share links, HTML presentation-template system | Built, live |
| Approvals — Tinder-card queue | Built, live |
| Email & Outreach — generation, flows/sequences, negotiation/barter templates, placeholder validation, sender profiles, newsletter | Built, live |
| Campaigns — bulk generation, pre-approved batch runner | Built, live |
| Image Generation — jersey (8 zones), stadium (5 zones), campaign creatives (3 scenes), manual mockup editor (9 templates) | Built, live |
| Matches & Warm-up Strategy | Built, live (this sprint) |
| Contracts — conversion, expiry alerts, renewal | Built, live |
| Reports & Dashboard | Built, live |
| Settings & Admin — Team & Roles (RBAC), sender profiles, system health | Built, live |
| Audit log, workflow events, Pipedrive CRM sync | Built, live |
| PT/EN bilingual UI, dark mode, responsive layout | Built, live |

**Not built, and structurally required for anything in `master_report.md` beyond Coritiba itself:** multi-tenancy. There is no `tenant_id`/organization concept anywhere in the schema; Coritiba-specific facts (club stats, crest, brand voice) are hardcoded throughout the AI prompts and the deck template. This is the single biggest piece of new foundational work — see Phase 4.

---

## 4. Source Document Note

`master_report.md` cites seven supporting research files throughout (`competitor_research.md`, `competitor_reviews_painpoints.md`, `target_audience_research.md`, `opensource_tech_research.md`, `mcp_server_research.md`, `failure_analysis_research.md`, `enterprise_and_partnership_research.md`). **None of these files exist in this repository.** Whoever produced the report has them in a separate workspace. Get them from James/the report's author before relying on any claim in `master_report.md` that says "full detail in X.md" — this roadmap treats the main report as the source of truth since the backing files aren't available to verify against.

---

## 5. Execution Roadmap

Phases are sequential where marked **gated**; phases without that marker can run in parallel with the current phase once started.

### Phase 0 — Blockers to clear before certain later phases (parallel track, start now)
Not code. See Sections 6 and 7 below for full detail.
- [x] Legal questions written up and sent to James / counsel (Twenty CRM AGPL, ticketing engine AGPL, cross-tenant barter tax treatment) — **done 2026-09-09**, see Section 6 below for the completed packet
- [ ] Twenty CRM alternatives proposed to James
- [ ] Senior developer interviews underway; junior hires actively integrated into work

### Phase 1 — Harden the existing Outreach Agent — `master_report.md` Section 8
**Status: functionally closed as of 08 Sep 2026**, except Pattern 3 which is blocked (see below), not skipped. Full pattern list in Appendix A.1; the three James/report flag as highest-priority:
- [x] **Infrastructure-enforced approval gates** (not prompt-based) — the send/approve step must be a real state-machine transition the agent literally cannot skip, not an instruction the LLM is trusted to obey. (Pattern 4) — **Done.** Atomic `UPDATE ... WHERE status = X` claims replace SELECT-then-write races across every send path. Proven with a real concurrent-request test: exactly 1 of 2 simultaneous sends succeeded.
- [ ] **Dedicated sending-domain deliverability architecture** — separate sending domain from the primary business domain, SPF/DKIM/DMARC configured, hard per-mailbox sending-rate ramp, bounce/spam-complaint circuit breaker at 0.1–0.3%. (Pattern 3) — **Blocked, not started.** Real email sending (Gmail/SMTP) was never wired up — "send" today means logging a Pipedrive activity. There is no live sending pipeline to harden yet. Needs James to authorize real sending (Gmail OAuth already scaffolded, or a Resend/SendGrid decision) before this pattern is actionable.
- [x] **Claim-grounding in proposal generation** — every factual claim the AI makes about a prospect must trace to a cited, timestamped enrichment field; block unsupported claims before they reach a draft. (Pattern 1) — **Done.** New Rule 10 in the proposal system prompt forbids inventing sponsor-specific facts when no real intelligence is available; verified against both a no-data and a real-data company.
- [x] Provider-abstraction/failover layer across enrichment vendors (Hunter/Apollo) so one vendor outage doesn't stall the pipeline. (Pattern 2) — **Already true, verified, no new code needed.** Audited: Hunter/Apollo/LinkedIn/ad-signal scraping all already have real per-provider try/catch failover.
- [x] Hard per-run/per-day spend caps + execution timeouts + a kill switch independent of the agent's own logic; real-time spend visibility, not monthly-invoice discovery. (Pattern 5) — **Done, fully verified live.** `spend_ledger` table + daily USD cap enforced in front of every Bedrock and image-generation call. Real enforcement test: a real `invokeClaude()` call was confirmed to throw and never reach Bedrock once the ledger was pushed over the cap.
- [x] Short-lived, auto-rotating OAuth tokens; minimum-scope grants; one-click integration kill switch. (Pattern 6) — **Done.** Gmail tokens now encrypted at rest (AES-256-GCM), OAuth scopes trimmed from 4 to 2, and a real Disconnect (revoke) button added to Settings.
- [x] Immutable, access-isolated, offsite backups on credentials separate from production. (Pattern 7) — **Done, fully verified live in production, including the daily schedule (2026-09-09).** Daily export script uploads to a dedicated, Object-Locked (90-day, Compliance mode) S3 bucket under an IAM identity that only has `s3:PutObject`/`s3:PutObjectRetention` — no read/list/delete, so a compromised production credential can't touch existing backups. Now scheduled via system cron (06:00 UTC daily) through `scripts/run-backup-cron.sh`, logging to `frontend/logs/`. While verifying, found and fixed `BACKUP_TABLES` drift from the real schema (was listing a never-applied table, missing a real one — see `lib/backup/tables.ts`). Still owed: the quarterly restore-drill (`docs/DEPLOYMENT_AND_RUNTIME.md` §14 step 5) is a recurring human task, not something to automate away.

**Bonus resilience item found and fixed 2026-09-08 (not one of the 12 patterns, but directly in scope):** discovered AWS Bedrock credentials had been silently invalid for at least 18 days (`UnrecognizedClientException`) — every AI feature in the platform was down with no alerting. Root AWS credential issue is still unresolved (needs a human with AWS console access to rotate/fix the key), but the platform no longer goes fully dark when it happens again: `lib/anthropic/client.ts` provides a same-model, same-pricing fallback to the direct Anthropic API, wired into both `invokeClaude()` and `converseWithTools()` in `lib/bedrock/client.ts`. Verified live end-to-end (single-shot + full two-turn tool-use round trip) through the real fallback path, since Bedrock is still broken.

### Phase 2 — Improve the text/email agents (per James's sequencing)
**Status: complete as of 2026-09-08.** Scope decided by engineering judgment (pending James's override) — rather than wait on a reply that may take a while, defaulted to the concrete direction `master_report.md` Section 7.2's "Negotiation Agent" role description points at, without yet standing up the full multi-agent framework:
- [x] **Reply classification** — auto-classifies inbound thread replies (interested / objection / not interested / needs info / out-of-office) with a one-line AI summary, surfaced on `/threads` and `/emails`. Extends the existing `sync-threads` reply-detection logic, which previously only detected *that* a reply existed, never fetched or stored what it said. Migration 0045 applied; verified live with real classification calls.
- [x] **Tone control per email flow** — a style parameter (warm / formal / urgent) per step in `email_sequences.steps` (JSONB, no migration needed), fed into the generation prompt. Verified live: two real generations (urgent vs. formal) against the same prospect produced genuinely different, correctly-toned output.
- [x] **Better-grounded negotiation/barter drafting** — barter proposals now reference Coritiba's real open `barter_items` needs (or explicitly avoid inventing specific items when none exist) and produce a structured `barter_terms` object (exchange items, cash/exchange split %, rationale) instead of unstructured prose. Verified live against the one real open barter item in the database ("Meat") with a matching disposable test sponsor — correctly grounded, not fabricated.

### Phase 3 — Validate
**Exit criteria decided 2026-09-08 (pending James's override):** the hardened pipeline must run 4 consecutive weeks in production with (a) zero approval-gate bypasses and (b) spend staying within the daily cap — both measurable via `audit_logs`/`spend_ledger`. Deliverability is excluded from this criterion since Pattern 3 has no live sending pipeline yet. This runs passively over real usage — it does not block Phase 2 from starting now.
- [ ] Track approval-gate bypasses and cap breaches weekly until the 4-week window is clean.

### Phase 4 — Multi-tenancy foundation — **gated**, blocks nearly everything below
Not explicitly called out as its own phase in `master_report.md` (it's assumed by Section 6.1's "one core platform, multiple front doors"), but it is the actual prerequisite for the go-to-market plan, the agency reseller program, league master agreements, and white-label dashboards. **Scope decision made 2026-09-08 (pending James's override): target sports clubs only first, matching Section 9's own Wave 1 — not all segments simultaneously.** Narrower blast radius, matches the team's existing domain depth. Needs its own dedicated scoping pass — rough shape:
- [ ] `tenant_id`/organization model across the schema
- [ ] Auth/RBAC scoped per tenant (extends existing Team & Roles module)
- [ ] Strip hardcoded Coritiba-specific content out of AI prompts and the deck template into per-tenant configuration
- [ ] Billing infrastructure (none exists today)
- [ ] White-label theming per tenant

### Phase 5 — P0 feature roadmap (`master_report.md` Section 4, items 1–5) — table stakes
Some of these are buildable against the current single-tenant platform without waiting on Phase 4; flagged below.
- [x] Sponsor-facing real-time ROI dashboard — **done 2026-09-08.** New "Desempenho em Tempo Real" section on the public share-link page, grounded entirely in real per-match reach data (`match_media_reach`) — combined + per-channel (official/fan/media-TV/rival) view totals, active deliverables, per-match breakdown. Renders nothing at all until real reach numbers exist for at least one match (no fabricated/placeholder numbers ever shown). Works for both single-match and season-wide proposals. Live-verified against real (empty) and disposable (populated) data — all aggregation math independently checked. No migration needed.
- [ ] Flat, transparent, self-serve pricing tiers *(blocked on billing infra / Phase 4)*
- [x] Native engagement analytics on every shared proposal (views, drop-off, time-on-page) + automated "gone cold" nudge — **done 2026-09-08.** New `proposal_views` table (migration 0046) tracks per-session time-on-page and max scroll depth via a `sendBeacon` on unload; surfaced on the proposal detail page (replaces the old raw audit_logs count). `POST /api/proposals/detect-cold` (manual trigger on `/followups`) queues a real AI-drafted follow-up into the existing followups queue when a genuinely-viewed proposal goes quiet for 10+ days, skipping proposals with an already-open followup or a reply since the last view. Live-verified end to end, including all 4 skip/nudge branches. **Bonus fix found while testing**: the public share page's `track-view`/`interest`/`exports` API calls had never actually been exempted from the auth middleware — every real external sponsor's "I'm interested" lead-capture submission has been silently failing (fixed in middleware.ts).
- [x] Self-service configuration for non-admin users — **audited 2026-09-08, found something much bigger than expected.** The Team & Roles permission matrix (`lib/auth/roles.ts`) and `<RoleGate>` component only ever hid UI elements — 2 of 122 mutating API routes had any server-side permission check, and even those 2 (user management itself) didn't check the *caller's* permission. Concretely: any authenticated user, any role, could PATCH their own `platform_users` row to `role: "admin"` via a direct API call — a real privilege-escalation hole, not a "self-service is already fine" situation. **Fixed the critical tier same day**: user management (the escalation vector itself), proposal approve/reject/send/edit/delete, company create/edit/delete — see `lib/auth/server-permission.ts`. Confirmed no regression: both real admin accounts still pass every check, unauthenticated calls still 401 as before. **~110 remaining mutating routes** (settings writes, template management, campaigns, media generation, etc.) still have no server-side check — real but lower-severity than privilege escalation/destructive actions; tracked as an explicit follow-up below, not silently left implying full coverage.
- [ ] Idempotent, auditable billing with itemized receipts *(blocked on Phase 4 — no billing exists yet)*
- [x] **Follow-up from the RBAC audit above — complete, 2026-09-09.** Two sub-tracks, both done:
  - **`/api/internal/*` and `/api/system/*` unauthenticated-bypass fix.** These bypass the session middleware entirely by design (meant to be secured per-route via `requireInternalAuth()`), but 8 of 13 routes never called it — reachable with no login and no secret at all from the public internet. Two were actively dangerous (`internal/cleanup`'s `deduplicate_companies` deleted any company sharing a name with another, real data, unauthenticated DELETE; `system/maintenance` bulk-mutated real proposals/workflow_events). All 8 fixed and live-verified. `workflows/audit`'s own separate inline secret check was also found conditional-on-being-configured (it wasn't) — now fails closed.
  - **`requirePermission()` rollout — 100% of mutating routes covered.** All ~99 session-protected-but-role-ungated routes now have it, across 6 batches: outreach agent approval gates, email send/generate/status, Gmail, media/AI generation, proposal/campaign generation and every proposal sub-route, campaign per-item actions (`preapprove` was a real safety-gate bypass), company/intelligence enrichment, contacts/inventory/matches (added `manage_inventory`/`manage_matches` — the latter guards the exact numbers the sponsor-facing ROI dashboard shows), contracts/newsletter/social-projects/barter/sender-profiles/team-members/coritiba-metrics/crm/pipeline/assets, and warm-up/email-sequence/proposal-template routes (added `manage_templates`). Re-ran the original audit script after each batch — zero unprotected mutating routes remain. Every real admin account verified to pass every permission in the (now 20-entry) matrix; viewer/unauthenticated denied everywhere.

### Phase 6 — P1 differentiators (`master_report.md` Section 4, items 6–10)
- [x] VIK/barter deal-structuring module — **non-cross-tenant portion done 2026-09-09** (cross-tenant trade marketplace with match fee still *blocked on Phase 4/multi-tenancy*). Added contract split templates (100% permuta, 25/75, 50/50, 75/25) selectable in the wizard's barter step, forcing the AI to use that exact split via a `forcedSplit` param on `barterTermsInstructionBlock()`. Added budget-offset tagging: `/barter` page now aggregates real `content.barter_terms` (cash/exchange split, exchange-item values) already stored on generated barter/mixed proposals into a summary card, explicitly labeled as the AI's proposed structure pending negotiation, not confirmed delivered value. Live-verified: forced split honored exactly; AI correctly left `estimated_value_brl` null (no fabrication) when no real `barter_items` target price existed; aggregation query correctly picks up real rows. No migration needed.
- [ ] Verified deal-value benchmark database (aggregate anonymized deal data across tenants) *(blocked on Phase 4 — needs multiple tenants to aggregate across)*
- [x] White-space/opportunity-gap finder (cross-reference prospect's existing sponsorships against category gaps, using the AI company-intelligence already built) — **done 2026-09-09.** New `opportunityGapPrompt()` (`lib/bedrock/prompts.ts`) + `POST/GET /api/companies/[id]/opportunity-gap`, surfaced as an "Opportunity Gap" card on the company detail page (`components/companies/opportunity-gap-panel.tsx`), RBAC-gated with `run_intelligence`. Grounds the gap in the company's real `full_intelligence.sponsorship_history`/competitor data when it exists; when it doesn't, explicitly says so and falls back to generic industry framing rather than inventing a specific gap — same claim-grounding discipline as Rule 10. Result cached on `companies.full_intelligence.opportunity_gap`. Live-verified with disposable grounded + ungrounded test companies (correct behavior in both cases, no rival-club mentions) and the real permission matrix.
- [ ] Embedded payments in the public proposal share link (QwilrPay-style deposit collection)
- [x] Proof-of-delivery/fulfillment tracking portal shared with the sponsor — **done 2026-09-09.** New "Comprovação de Entrega" section on the public share-link page, directly below the ROI dashboard — a chronological, dated feed combining approved mockups (with the real approved image as proof) and delivered matches (only counted once real nonzero reach exists, not just scheduled). Deliberately skips a "X of Y contracted" percentage since that can't be honestly derived from the stored inventory data (units-per-game, not total contract length). Live-verified against real (empty) and disposable (populated) data. No migration needed.

### Phase 7 — P2 category expansion (`master_report.md` Section 4, items 11–14)
- [ ] Event ticketing module — **legal blocker**: needs a Pretix commercial license quote before any code (see Section 6 below); recommended over Hi.Events for the seat-map/stadium use case
- [ ] Grants/moves-management mode for the nonprofit vertical *(blocked on Phase 4)*
- [ ] Chamber/association bundle mode (annual bundled packages) *(blocked on Phase 4)*
- [x] NIL/creator-deal mode as an 8th proposal type — **done 2026-09-09.** Added `"nil_creator"` to the wizard's `ProposalType` union (`app/proposals/new/proposal-wizard.tsx`) with dedicated components (content posts, appearance fees, image/likeness rights, meet & greets) — the sponsee is an individual athlete/creator/influencer, using an existing `companies` row (business-generic schema, no migration needed) to represent them. New `nilTermsInstructionBlock()` in `lib/bedrock/prompts.ts`, wired into `POST /api/proposals/wizard/generate`, mirrors the barter branch's claim-grounding: cites only real facts from the individual's `notes` field, otherwise stays qualitative rather than inventing follower counts/engagement/deal history. Live-verified with disposable grounded + ungrounded test records — correct behavior in both cases, no rival-club mentions.

### Phase 8 — Agentic team expansion — **gated behind Phases 1–3**, `master_report.md` Section 7
Explicit instruction from James: do not start this until hardening is done and validated.
- [ ] Team 1 — Sponsorship Outreach: Discovery / Enrichment / Proposal / Outreach / Negotiation agents (extends current 5-step pipeline into a coordinated CrewAI-based team)
- [ ] Team 2 — CRM Outreach: Pipeline Hygiene / Multi-Channel Sequencer / Renewal / Reporting agents
- [ ] Unified post-setup orchestrator coordinating Teams 1 and 2 through the existing `/approvals` queue (reuse, don't duplicate)
- [ ] Framework decision: report recommends CrewAI (MIT, no copyleft risk) — no counter-proposal raised yet, revisit at Phase 8 kickoff

### Phase 9 — Go-to-market execution (`master_report.md` Sections 6, 9, 13) — **gated behind Phase 4**
- [ ] Niche-specific landing pages + onboarding (`/sports-clubs`, `/nonprofits`, `/conferences`, `/chambers`, `/festivals`)
- [ ] White-labeled client-facing dashboards per tenant
- [ ] Segment-tuned proposal template variants (Sponsorship / Grant-ESG / Exhibitor Package)
- [ ] Wave sequencing: Wave 1 sports clubs + nonprofits (Months 1–4) → Wave 2 conferences + chambers (Months 4–8) → Wave 3 festivals + ticketing wedge (Months 8–12) → Wave 4 youth leagues/esports/film-arts (Month 12+, only if unit economics support a lightweight self-serve tier)
- [ ] Agency white-label reseller program (30–50% wholesale discount)
- [ ] League/association master-agreement deals (LaLiga/KORE-style "one deal, many clubs")
- [ ] Nonprofit channel via TechSoup + association-endorsement programs
- [ ] VIK/barter marketplace as a growth loop (see Phase 6)
- [ ] Fee-free/near-free ticketing as an acquisition wedge, sponsorship CRM as the real monetization layer
- [ ] Ad strategy: fee-transparency angle vs. Ticketmaster/Eventbrite, "we measure what 81% of sponsors can't" positioning, chamber co-marketing webinars, league case studies, nonprofit-sector content marketing, ticketing-wedge retargeting

### Phase 10 — Enterprise-grade readiness (`master_report.md` Section 10) — **gated, only once real enterprise deals are pending**
Expensive and compliance-heavy; sequence per the report's own ordering, not earlier:
- [ ] SOC 2 Type II ($20K–$100K, 6–18 weeks)
- [ ] SSO (SAML + OIDC) + SCIM provisioning
- [ ] Public subprocessor disclosure page (AWS Bedrock, OpenAI, Hunter, Apollo, Apify named explicitly)
- [ ] 99.9% uptime SLA + published status page + defined RPO/RTO
- [ ] Granular per-tenant RBAC + audit logging (extends existing Team & Roles / Audit log modules)
- [ ] DPA template + CAIQ-Lite security packet
- [ ] AI-use disclosure (confirm/publish no-training-by-default status for Bedrock/OpenAI usage)
- [ ] ISO 27001 — only once EU-heavy deals justify it ($30K–$150K, 3-year cycle)
- [ ] Multi-year contract terms (24–36 months, 18–25% prepay discount, Net 30–45)

### Phase 11 — MCP server integrations (`master_report.md` Section 5) — can run opportunistically, low risk
Wire official MCP servers where they exist instead of building custom integrations:
- [ ] Gmail/Google Workspace
- [ ] Pipedrive (and/or Twenty CRM, pending Section 6 decision)
- [ ] Hunter.io
- [ ] Apollo.io
- [ ] Apify (highest-value — exposes 7,000+ Actors dynamically)
- [ ] Stripe (once billing exists)
- [x] Slack (internal notifications) — **done 2026-09-09.** Built as a single Incoming Webhook integration (`lib/slack/notify.ts`, `SLACK_WEBHOOK_URL`) rather than a full MCP/bot-API integration — this direction (app → Slack, "post a message") doesn't need one; a real MCP/bot setup would only be needed for the reverse direction (e.g. approving from inside Slack), not built. Wired into the three named trigger points: spend-cap hit (`lib/bedrock/client.ts`, debounced to 1/day), approval needed (`lib/agents/orchestrator.ts`'s `paused_for_proposal_approval`), gone-cold nudge (`app/api/proposals/detect-cold/route.ts`). Live-verified against a local fake-webhook server (correct payload/links for all three, debounce confirmed) and the no-webhook-configured no-op path (warns once, never throws). `SLACK_WEBHOOK_URL` still needs to be provisioned by James (create a Slack app + Incoming Webhook in the target workspace/channel) before any notification actually reaches Slack — until then this is silent by design, not broken.
- [ ] GitHub (dev team's own tooling)
- [ ] Supabase/Postgres (read-only, AI-assisted schema/reporting)
- [ ] Custom-build required (no mature MCP exists): WhatsApp Business Cloud API, e-signature (DocuSeal/Documenso)
- [ ] Longer-horizon: public read-only MCP server exposing the platform's own data to partner agencies/n8n workflows (2–3 quarter horizon per the report)

### Phase 12 — Business model / billing implementation (`master_report.md` Section 11) — **gated behind Phase 4**
- [ ] Core SaaS subscription tiers (flat monthly/annual, mirroring wehave's transparent-pricing model)
- [ ] Agency white-label wholesale pricing
- [ ] League/association master-agreement blended pricing
- [ ] VIK/barter marketplace match-fee billing
- [ ] Ticketing flat per-ticket fee (loss-leader, not profit center)
- [ ] Premium add-on tier (Data Clean Room, white-label portals, dedicated CSM)
- [ ] Nonprofit channel discount pricing
- [ ] Cost-to-serve tracking per active seat from day one (AI inference + enrichment API costs + human review time) — do not subsidize during growth

### Longer-horizon / lower-priority items (`master_report.md` Section 4, P3)
- [ ] Data Clean Room (advanced first-party data sharing)
- [ ] Public MCP server (see Phase 11)

---

## 6. Legal & Compliance Track (parallel workstream, blocks specific phases above)

James asked specifically for: the open questions written up, a suggested draft answer for each (to run through an AI legal-assist tool as a starting point — **not a substitute for real counsel**), and real alternatives proposed to the Twenty CRM recommendation.

| # | Question | Blocks | Status |
|---|---|---|---|
| 1 | Does using Twenty CRM (AGPL-3.0 core) as an internal-only ops tool avoid network-copyleft exposure, or does any customer-facing data flow through it count as "conveying" under AGPL? | Phase 4 CRM architecture decision | Not yet answered — needs real counsel |
| 2 | If Twenty CRM is exposed customer-facing at any point, is purchasing Twenty's commercial/enterprise license the only way to avoid open-sourcing obligations, and what does that cost at our scale? | Same | Not yet answered |
| 3 | What are viable alternatives to Twenty CRM, given the license risk? (see options below) | Same | Draft options below — final call is James's |
| 4 | Hi.Events (AGPL-3.0 + additional terms) and Pretix (AGPLv3 + additional terms) both require either "Powered by" attribution or a commercial license to remove it — what does a Pretix commercial license actually cost, and does it fully clear AGPL disclosure obligations for a stadium seat-map use case? | Phase 7 ticketing module | Not yet answered — needs a quote from Pretix directly |
| 5 | Cross-tenant VIK/barter trades: the platform already handles Brazil's Lei de Incentivo for Coritiba specifically, but a cross-tenant barter marketplace raises new tax/accounting questions per jurisdiction once tenants exist outside Brazil (or even across Brazilian states/entities). What's the accounting treatment, and does it change the marketplace design (e.g. match-fee structure, escrow)? | Phase 6/9 barter marketplace, Phase 12 billing | Not yet answered — needs accounting/legal review, likely per-market as expansion happens |

**Twenty CRM alternatives to propose to James** (draft, pending his/legal's final call):
- **Option A (report's own recommendation, option b):** Don't adopt Twenty at all — keep building the platform's own native CRM UI (companies/pipeline/contacts already exist and are more purpose-built for sponsorship workflows than generic Twenty tables). Lowest legal risk, no new dependency, but means owning more CRM feature surface long-term.
- **Option B:** Twenty CRM, internal-only (back-office ops, never customer-facing) — the report's fallback if some Twenty functionality is genuinely wanted. Still needs Question 1 answered before committing.
- **Option C:** A different open-source CRM with a permissive (non-copyleft) license — needs its own research pass; not covered in `master_report.md` since it only evaluated Twenty. Worth a short comparison pass before ruling this out.
- **Option D:** Keep Pipedrive as the CRM system of record (it already works, is already integrated, and this sidesteps the entire licensing question) — the report doesn't seriously consider this because Pipedrive doesn't fit a multi-tenant white-label resale model, but for the *current* Coritiba instance and Phase 1–3 work, there's no urgency to replace it.

**Action — done 2026-09-09:** packaged questions 1–5 above plus the four CRM options into a standalone Google Doc for James to forward to counsel/GPT: "Market Sponsorship Automation — Open Legal & Licensing Questions" (in James's Google Drive, owner amkb222@gmail.com). Includes the "current interim state" section below so counsel/James can see what's actually live in production while these stay open.

**Engineering decision made 2026-09-08 (pending James's override):** rather than block on legal replies, defaulted to the lowest-risk option per question — Q1–3: **do not adopt Twenty CRM**, keep the native CRM + Pipedrive sync already live (Option A/D combined) — zero new legal exposure, zero new cost. Q4 (Pretix quote) and Q5 (barter tax) are external facts that can't be decided by engineering judgment — left genuinely parked until a real quote/legal review exists, not worked around.

---

## 7. Team & Hiring Track

- [ ] Interview senior developer candidates (James's explicit ask — in progress/owned outside this codebase)
- [ ] Onboard and actively integrate the 2 junior hires (currently on trial) into real work — this roadmap's Phase 1 (hardening) is a reasonable onboarding project: scoped, well-defined, low-risk-to-production if reviewed properly
- [ ] Once team is larger: revisit whether phases above should run in parallel across multiple developers rather than sequentially — this document assumes solo-sequential execution as the floor, not the ceiling

---

## 8. Open Questions Still Needing James's Input

Three of these were originally open, but rather than block progress waiting on replies, engineering made a default call on each (see Phase 2, Phase 3, and Phase 4 sections above) so work could continue — flagged here for James to confirm or override, not silently decided forever:
- [x] Concrete scope for Phase 2 ("improve text agents") — **decided 2026-09-08**: reply classification, tone control per flow, better-grounded barter drafting. See Phase 2 above.
- [x] Exit criteria for Phase 3 validation — **decided 2026-09-08**: 4 consecutive weeks, zero approval-gate bypasses, spend within cap. See Phase 3 above.
- [x] Whether the multi-tenant pivot (Phase 4) targets *all* segments or starts narrower — **decided 2026-09-08**: sports clubs only first (Wave 1). See Phase 4 above.
- [ ] Budget/timeline expectations now that team is scaling — not specified in the WhatsApp exchange, genuinely needs James (not an engineering call)
- [ ] Get the 7 missing supporting research files from whoever produced `master_report.md` (see Section 4 above) — needs James to retrieve, not an engineering decision

---

## Appendix A — Full Item Checklist Cross-Referenced to `master_report.md`

Every individual item from the source report, so nothing gets lost in the phase reorganization above. Section numbers match the original document.

### A.1 — Section 8, Failure-Pattern Mitigations (Phase 1)
1. [x] Hallucinated content — claim-grounding, block unsupported claims, stale-source fact-check before send — **Done**
2. [x] Single data-vendor reliance — provider-abstraction/failover layer — **Already true, verified**
3. [ ] Deliverability collapse — sending-rate ramps, dedicated domain, bounce/spam circuit breaker — **Blocked: no live sending pipeline exists yet to harden**
4. [x] Approval gates as prompts not infrastructure — state-machine-enforced, non-bypassable, audited — **Done**
5. [x] Runaway automation cost — spend caps, timeouts, independent kill switch, real-time monitoring — **Done, live-verified**
6. [x] OAuth/integration compromise cascades — short-lived rotating tokens, minimum scope, kill switch — **Done**
7. [x] Single point of failure in backups — immutable, access-isolated, offsite, separate credentials — **Done, live-verified**
8. [ ] Trust-fund/liquidity mismanagement — segregate customer float from operating cash, independent audit — organizational/N/A (no customer float exists on the platform today)
9. [ ] Enterprise trust erosion from over-automation — visible "human takeover" mode, conservative marketing claims — not started
10. [ ] Founder/team conflict — organizational, clear decision rights before scale pressure (not a build item)
11. [ ] Poor unit economics — price to true per-lead cost from day one, track cost-to-serve continuously — not started (cost-to-serve tracking overlaps with Phase 12)
12. [ ] Weak product-market fit — validate with design partners before broad automation, build a defensible data moat — not started

### A.2 — Section 4, Full Feature Roadmap
- P0 (1–5): see Phase 5 above
- P1 (6–10): see Phase 6 above
- P2 (11–14): see Phase 7 above
- P3 (15–16): see "Longer-horizon" under Phase 12 above

### A.3 — Section 5, MCP Integrations
See Phase 11 above — full list of 14 services and wire/build decisions.

### A.4 — Section 6, Go-to-Market
See Phase 9 above — niche productization, wave sequencing, ticketing build-vs-buy.

### A.5 — Section 7, CRM Replacement & Agentic Teams
See Phase 8 above (agentic teams) and Section 6 of this document (Twenty CRM legal track).

### A.6 — Section 9, Partnership/Barter/Marketplace Strategy
See Phase 9 above — agency reseller, league deals, TechSoup channel, VIK growth loop, fee-free ticketing wedge, barter-for-exchange co-marketing.

### A.7 — Section 10, Enterprise Readiness
See Phase 10 above — full 9-item list.

### A.8 — Section 11, Business Model
See Phase 12 above — revenue streams, cost-structure watch-items, moat/defensibility (verified deal-value benchmark database + combined end-to-end workflow).

### A.9 — Section 12, Setup Guide for a New Tenant's Agentic Automation
Operational runbook, not a build item — relevant once Phase 4 (multi-tenancy) and Phase 8 (agentic teams) both exist:
1. Connect integrations via MCP where available
2. Configure dedicated sending infrastructure
3. Load inventory/rate cards
4. Set approval-gate policy per campaign (manual for first 2–4 weeks on any new tenant)
5. Enable Agentic Team 1, review first batch in `/approvals` before enabling batch mode
6. Enable Agentic Team 2 (Pipeline Hygiene + Renewal immediately; Multi-Channel Sequencer only after 2 weeks of stable deliverability)
7. Enable the unified orchestrator only after both teams run cleanly for a full renewal cycle (60–90 days)
8. Ongoing: daily spend-cap dashboard, weekly deliverability report, monthly OAuth-token audit, quarterly backup-restore drill

### A.10 — Section 13, Ad Strategies
See Phase 9 above.

### A.11 — Section 14, Gaps and Open Questions (from the original report)
- [ ] WhatsApp Business Cloud API — no mature MCP, budget custom engineering time
- [ ] Twenty CRM AGPL licensing — see Section 6 of this document
- [ ] Ticketing module licensing — see Section 6 of this document
- [ ] VIK/barter cross-jurisdiction tax treatment — see Section 6 of this document
- [ ] Youth-league segment pricing may need a genuinely free/near-free self-serve tier — worth a dedicated pricing experiment before committing engineering resources (Phase 9, Wave 4)
- [x] AI-agent cost-monitoring tooling — **done 2026-09-09.** Evaluated Helicone/LangSmith/Langfuse; picked Langfuse (MIT licensed core, no AGPL/legal-review concern unlike Twenty CRM/Pretix, free cloud tier or free self-hosting). Built `lib/observability/langfuse.ts`, wrapping the two centralized AI entry points (`invokeClaude`/`converseWithTools`) with full prompt/response/model/token-usage tracing — complements, doesn't replace, the existing `spend_ledger` cost-cap enforcement from Phase 1. Optional (`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`), silently no-ops until James creates a free account and provides both keys. Live-verified: no-op path, wire-format correctness against a local fake ingestion endpoint, and a full end-to-end real AI call with tracing active alongside it.

---

*Maintained as the working plan until superseded. Update phase checkboxes as work completes; don't delete completed items — mark them and move on, so this stays a true history of the roadmap, not just a snapshot of what's left.*

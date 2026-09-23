# UX/UI Audit — Coritiba FC Commercial Intelligence Platform

**Date:** 23 September 2026
**Scope:** Internal admin app only (sponsor-facing proposal/portal views are out of scope). Requested by James (platform owner): a detailed evaluation of every major screen, with concrete, specific redesign recommendations — not generic "add whitespace" advice.
**Method:** Live, logged-in inspection of the production app at `https://eligibly-facing-unloved.ngrok-free.dev`, using Playwright to navigate, screenshot, and inspect the actual rendered DOM (not source code) as `patrocinios@coritiba.com.br`. Pages inspected: Dashboard, Companies list + detail, Pipeline, New Proposal wizard (steps 1–3), a live Proposal detail page, Campaigns list + two detail pages (one empty shell, one fully developed, chosen specifically to test James's flagged concern), Approvals queue, Agents overview, the full sidebar (~40 links), and three Settings pages (Email Flows, Presentation Templates, Team & Roles). Every finding below reflects something actually observed on screen, with exact copy quoted where useful.

---

## Flagged technical issues (not UX opinions — separate from the design findings below)

These are things that look like actual bugs or data-integrity problems, observed live, not judgment calls about layout or wording. They are called out here, up front, because the brief asked for backend-looking breakage to be distinguished clearly from design critique. No code was touched; these are reported only.

1. **Two different "active contracts" counts on the same Dashboard.** The top KPI card "Total Active Revenue" reads "0 active contracts" while the metrics row below it reads "Active Contracts: 4 — signed sponsors." Same dashboard, same load, two numbers for what reads as the same fact.
2. **Two different proposal counts, same data set.** Dashboard says "131 Proposals · 19 need review." The Proposals list page (`/proposals`) says "135 sponsorship proposals." Google's company page separately says "Proposals (3)."
3. **The Company Details edit form contradicts its own summary pills.** On the Google company page, the top summary pills read "Segment: Global" and "Size: Enterprise." The editable form fields directly below, for the same company, show "Segment: Local" and "Size: Small" selected. Two different values for the same two fields, visible in the same viewport.
4. **Two conflicting "Sponsorship Fit" scores for the same company on the same page.** Google's company detail page shows "SPONSORSHIP FIT 7.4/10" in the top-right card and, again, "7.4/10" in the Intelligence tab body — but the "Differentiator Analysis" card just below it shows "Sponsorship Fit 8.7/10." Same company, same page load, two different fit scores under the same label.
5. **"Awaiting review" counts disagree between the Agents page and the Approvals page.** `/agents` states "275 item(s) awaiting your review — 86 proposal(s) · 20 email(s) · 169 campaign(s)," explicitly captioned "every agent below writes here, nowhere else" (i.e., claiming this is the same queue as Approvals). `/approvals` itself shows "173 items — Proposals 100 · Campaigns 50 · Emails 23." The campaign figure (169 vs 50) matches the *total* campaign count shown on `/campaigns` ("169 campaigns"), suggesting the Agents page may be counting all campaigns rather than ones actually pending review.
6. **Stale AI-generated timing advice.** Google's Company Intelligence panel includes a highlighted "Best timing" box recommending outreach be timed to "Q3 2025... align with Google Brazil's annual budget planning cycle." Today is September 2026 — that recommended window closed over a year ago, and there's no visible "generated on" timestamp on that card to let staff know the advice is stale.
7. **Inventory items are miscategorized.** In the New Proposal wizard's inventory step, the category header `LED_BOARD` (rendered as a raw, un-humanized enum string, not "LED Board") contains items like "Ingressos por Show," "Ingressos Coxa Day," and "Coxa Run (Direito de Ativação)" — these read as ticket/activation line items, not LED signage. Either the category taxonomy or the data entry looks wrong.
8. **Nearly every inventory line item shows "1 of 1 available."** Across dozens of items in the wizard's inventory step, almost all show identical "1 of 1 available" and no price, which reads more like an un-set default than tracked real availability/pricing data.
9. **Full-page screenshot capture timed out on `/companies` and required a large scroll budget on `/pipeline`, `/proposals`, `/campaigns`, and the wizard's company picker** — in each case because the page renders its entire result set into the DOM at once (537 companies, 540 pipeline leads, 135 proposals, 169 campaigns) with no pagination or virtualization. The Pipeline page in particular rendered as a single 36,000-pixel-tall document. This is a performance risk today and will get materially worse under multi-tenant SaaS with more data per tenant.
10. **Test/QA records live in production-facing lists, indistinguishable from real ones at a glance.** Confirmed in at least five separate places: the Companies list ("James Test Competitor June9," "Banco Itaú Test E2E BJ," "Banco Itaú Test E2E Jun9"), the Pipeline board ("Banco Itaú Test -2," "Outra Empresa" = "Other Company," "Empresa Exemplo" = "Example Company"), the Presentation Templates settings page (2 of 4 templates are literally named "test" and "Test"), and the Team & Roles page (a team member named "admin_test," email `admintest@coritiba.com.br`).
11. **"Uses AWS Bedrock — Claude Sonnet"** is displayed as static copy under the Campaign Generator's "Generate ideas" button. Worth double-checking this claim is still accurate given the AWS Bedrock credential status noted elsewhere in the project's history — if the app has fallen back to a different provider, staff are being told the wrong thing about what's powering a feature they rely on.

---

## Cross-cutting issues

### 1. The PT/EN toggle only translates the sidebar — everything else stays in whatever language it was authored in
This is worth stating precisely because the brief specifically asked whether the bilingual UI is applied consistently: **it is not.** Toggling the language switch at the bottom of the sidebar fully re-labels all ~40 navigation links (confirmed: "Empresas"→"Companies," "Jogos"→"Matches," "Fluxo de Propostas"→"Proposal Workflow," "Equipe & Perfis"→"Team & Roles," etc.). But every page's actual content — headings, buttons, table columns, card copy, empty-state text — is already in English *before* you touch the toggle, and stays exactly the same *after* you touch it. Meanwhile, scattered through that "English" content are un-translated Portuguese fragments that the toggle has no power over, because they're either hardcoded into specific components or coming straight from AI-generated/database content:
- On the Google company page, every action button is English ("Run Agent," "Save Changes," "Re-run," "Scrape Website") except one — "Analisar" — sitting in the "Opportunity Gap" card.
- On the "Google × Coritiba FC — barter" campaign page, the entire "Pacote de Inventário" card (heading, helper text, both buttons — "Salvar," "+ Adicionar item," the empty-state copy "Adicione itens do catálogo para montar o pacote de patrocínio") is in Portuguese, immediately below and above cards that are entirely in English.
- On the Approvals queue, the List/Cards view toggle reads "Lista" / "Vista em Cards" while the rest of the page ("Approval queue," "Reject," "Edit," "Approve") is English.
- In the proposal wizard's company-picker "Intelligence preview" card, the field *labels* are English ("Industry:", "Type:", "Scope:") but sit directly next to Portuguese *values* and a fully Portuguese free-text note ("Cidade/Local: Londrina/Curitiba | Atividade / Observação: Alto padrão...").

**Why it matters:** staff currently read this as "the app is in English with some sloppy Portuguese leaking through," when the actual architecture is "the sidebar is properly localized and the content layer isn't." That's an important distinction for fixing it — and for the multi-tenant future, where a non-Brazilian client using this same platform would hit these same Portuguese fragments baked into shared components (the barter-inventory card, for instance) no matter what language they select.

**Recommendation:** Audit every hardcoded PT string in page content (the inventory-package card is the worst single offender) and route it through the same i18n mechanism the sidebar already uses. Until that's done, do not present the PT/EN toggle as if it covers the whole app — it currently only covers navigation chrome.

### 2. Nothing distinguishes an AI-generated placeholder from real, considered work — James's exact flagged concern, and it's bigger than just Campaigns
Confirmed directly by opening two campaigns side by side:
- **"Google × Coritiba FC — barter"** (empty shell): its entire "Campaign concept" is the sentence *"Wizard-generated campaign for Google"* — the same generic boilerplate line shown in the list-view teaser. No strategy tag. No activation plan, partnership angle, or call-to-action sections render at all for this campaign.
- **"Passaporte Coxa — Programa de Fidelidade Havaianas para Sócios Coritiba"** (fully developed): has a colored "Loyalty Strategy" tag, a genuine four-sentence strategic concept, plus three additional sections entirely absent from the empty one — "Activation plan at Couto Pereira," "Partnership angle," and a quoted "Call to action."

Both are labeled with the identical gray **"draft"** pill, on identical card layouts, in the same list. The only way to tell them apart is to open each one and read the body text closely, or notice the presence/absence of a small colored strategy-type tag that isn't currently framed as a completeness signal.

This same pattern — real-looking chrome around empty or placeholder content — recurs well beyond Campaigns:
- **Dashboard:** two of the three top KPI cards ("Total Active Revenue," "Avg Deal Size") render an em dash "—" instead of a number, styled in the identical bold green/purple card treatment as the populated "Pipeline Value" card next to them.
- **Pipeline:** "Pipeline Value" and "Revenue Won" both read **"Not tracked"** in the same bold colored typography used for the real "540" Active Leads figure.
- **Proposal detail page:** "Version History" says "No snapshots yet," "Review History" says "No reviews yet" — these two are actually handled reasonably well (muted gray, explanatory sentence), which is worth noting as the pattern to standardize on elsewhere.
- **Company detail (Google):** the "Warm-up Strategy" card is entirely empty save for a single "Start a warm-up strategy" button, with no visual distinction from the fully-populated cards surrounding it.

**Why it matters:** these are the exact screens a commercial staffer scans to decide what to work on next. If a "draft" campaign with zero real content and a "draft" campaign that's ready to price out look identical in the list, staff either waste time opening empty ones or — worse — miss that a promising one needs no further work.

**Recommendation:** Introduce one consistent, explicit completeness signal used everywhere a record can be partially filled: a small progress indicator ("Strategy ✓ · Inventory 0 items · Brief not generated") shown both in list rows and at the top of detail pages. Reserve the "draft" status pill for its actual meaning (workflow stage) and stop overloading it to also imply "has real content." Empty numeric fields should render as a visually distinct muted state (e.g., "—" in light gray, small caps "not yet tracked"), never in the same bold/colored treatment as real figures.

### 3. Lists render every record at once, with no pagination — confirmed on five separate pages
The Companies list (537 rows), the Pipeline board (540 leads), the Proposals list (135 rows), the Campaigns list (169 rows), and the company-picker inside the New Proposal wizard (all 537 companies in a scrollable dropdown) each render their *entire* result set into the DOM in one page load rather than paginating or virtualizing. This is why `/pipeline`'s full-page screenshot came out 36,000 pixels tall, and why a full-page screenshot of `/companies` timed out entirely during this audit.

**Why it matters:** today it's merely slow and makes screenshots/scrolling unwieldy. Under the planned move to multi-tenant SaaS, a busier client (more companies, more proposals per season) will make this materially worse — this is a scalability problem hiding in plain sight, not just a cosmetic one.

**Recommendation:** Paginate or virtualize every list view above roughly 50–100 rows, starting with Companies and Pipeline (the two worst offenders). This is an engineering task, not a visual redesign, but it directly affects perceived UI quality.

### 4. The sidebar has ~40 links across 6 groups with real imbalance, duplication, and misplacement
Exact counts, confirmed from the rendered nav: **CRM (7): Dashboard, Empresas, Contatos, Pipeline, Contratos, Jogos, Reports. Fluxo de Propostas (15): Nova Proposta, Campanhas, Bulk Proposals, Campanha em Massa, Aprovação em Massa, Propostas, Presentation Templates, Aprovações, E-mails, Modelos de E-mail, Email Flows, Estratégias de Aquecimento, Newsletter, Conversas, Follow-ups. Inteligência (7): Intel Coritiba, Product Discovery, Inventário, Permuta/Compras, Lei de Incentivo, Ativos da Marca, Newsletter Config. Mídia & Visuais (3). Integrações (1): Sync CRM. Sistema (7): Agents, Fluxos de Trabalho, Auditoria, Manutenção, Configurações, Perfis de Envio, Equipe & Perfis.**

Specific problems observed:
- **Fluxo de Propostas has 15 items — Integrações has 1.** A 15x imbalance between the largest and smallest top-level group.
- **The proposals list itself ("Propostas") is the 6th item down** in its group, buried below "Nova Proposta," "Campanhas," "Bulk Proposals," "Campanha em Massa," and "Aprovação em Massa" — a new user looking for "show me all my proposals" has to scan past four other items first.
- **Settings sub-pages are duplicated into top-level nav.** "Presentation Templates," "Email Flows," "Newsletter Config," and "Perfis de Envio" are all `/settings/*` routes, but they also appear as direct top-level sidebar links in three different groups, while a separate general "Configurações" link also exists in Sistema. Clicking into any of these lights up *two* sidebar items simultaneously as "active" (confirmed on both the Email Flows and Presentation Templates pages: the specific link and "Configurações" are both highlighted green at once) — an inconsistent, confusing active-state signal that doesn't happen on non-`/settings/` pages like Team & Roles.
- **"Newsletter" and "Newsletter Config" live in two different top-level groups** ("Fluxo de Propostas" and "Inteligência" respectively) despite being the same feature and its settings page.
- **"Perfis de Envio" (sending identities) and "Equipe & Perfis" (user accounts)** both contain the word "Perfis" but refer to unrelated things — easy to confuse while scanning quickly.
- **"Lei de Incentivo"** is both a top-level Inteligência nav item (a tracking/info page) *and* one of the 10 proposal types in the New Proposal wizard — same term, two different destinations and purposes.
- Two similarly-scoped items sit oddly close: **"Campanhas"** and **"Campanha em Massa"** (singular vs. "em massa"/bulk), and **"Bulk Proposals"** vs. **"Aprovação em Massa"** — the English/Portuguese split between near-synonym items ("Bulk Proposals" vs. "Campanha em Massa," "Aprovação em Massa") makes it harder to tell at a glance which is which.

**Recommendation:** Cut Fluxo de Propostas down by removing the four Settings-duplicate links from top-level nav entirely (they're reachable via Settings, which already exists) — that alone drops it from 15 to 11. Reorder so "Propostas" (the list) sits immediately after "Nova Proposta." Move "Newsletter Config" to sit next to "Newsletter." Fix the double-active-highlight bug on Settings sub-pages.

### 5. Internal engineering/system metadata leaks into user-facing copy
Several places show staff raw implementation detail that reads as developer notes rather than product copy:
- Pipeline page: a box titled "Pipeline Hygiene Check" with the subtitle "Flags deals with no activity for 14+ days **(Phase 8, Team 2 agent)**" — internal project-tracking language shipped directly into production UI.
- Pipeline page again: a full info box exposing raw database field names in monospace — `pipedrive_deal_id`, `pipedrive_org_id`, `pipedrive_synced_at` — to end users who have no reason to know or care about field names.
- Proposal detail page: "Generation Details — Prompt version: `v3.0.0`" shown as if it's meaningful information for a commercial staffer.
- Campaign detail page footer: "Prompt version: v3.0.0" repeated here too.

**Why it matters:** this is a small thing individually but it consistently undermines the sense that the product is a finished, polished tool built for salespeople rather than a work-in-progress visible mid-build. It also does the opposite of building trust in the AI features — showing a prompt version number doesn't help a user judge whether to trust the output; showing when it was generated (staleness — see Flagged Issue #6) would.

**Recommendation:** Strip "(Phase X, Team Y agent)" language and raw field names from anything user-facing; move them to an admin/debug view if they're needed at all. Replace "Prompt version" with something actionable, like a plain-language "Generated [date] — Regenerate" affordance.

### 6. Duplicate and redundant "Add/Create" affordances
On the Dashboard alone: a "+ New Campaign" button and a "⚡ Create Proposal" button top-right, *plus* four quick-action tiles just below ("Add Company," "Generate Campaign," "Create Proposal" — duplicating the header button, "Generate Images"), *plus* a persistent floating green "+" button bottom-right that appears on nearly every page (Dashboard, Companies list, Pipeline, Campaigns). The Companies list separately has "Bulk import CSV," "Add Company," and the same floating "+" — three ways to add a company visible in one view.

**Recommendation:** Keep one primary create action per page (header button) plus the global FAB for cross-page quick-add; drop the redundant quick-action tiles that just re-point to the same destination as the header button.

---

## Per-page findings

### 1. Dashboard (`/`)
No backend-looking bugs beyond the ones flagged above (contradictory active-contract counts, em-dash KPI cards).

- The page opens with 3 large KPI cards, a decorative club-identity banner ("Coritiba FC × Couto Pereira... 1.5M+ followers · 38+ matches/season · Brasileirão 1985 & 1990"), 4 quick-action tiles, then **two separate rows of small metric tiles (6 + 8 = 14 tiles)**, before finally reaching "Recent proposals," "Recent emails," and "Recent activity." That's roughly 21 numeric or action tiles before any actual work item appears.
- **"Pipeline Value" is shown twice** — once in the top KPI card row (R$1650K) and again in the second metrics row (R$1.6M) — same figure, two different visual treatments, no cross-reference.
- **Two different email volume metrics sit side by side and can be conflated:** "Emails Sent: 22 — total outreach emails" vs. "Sent This Month: 0." A quick glance could easily read these as contradictory rather than as "total" vs. "this month."
- **Email engagement is at 0% open rate / 0 clicks against 22 sent emails.** This may well be accurate (or a known, already-tracked issue per the product's engagement-analytics work), but on the page itself there's nothing to distinguish "this is genuinely zero engagement" from "tracking isn't wired up" — it reads the same either way.
- **The "Recent activity" feed is raw system-event notation**, not a human activity feed: entries read "validation › weekly report," "asset › updated," "proposal › wizard generated," "company › lead captured," each with a small tag chip like `system`, `image_job`, `proposal`. This is the event-log taxonomy shown verbatim rather than translated into a sentence a salesperson would write ("New proposal generated for Google," "3 images updated").
- **Status pill capitalization is inconsistent within the same list:** "Recent proposals" shows "Under Review" and "Active / In Contract" in Title Case, but "draft" and "approved" in lowercase — visible in a five-item list where both styles appear side by side.

**Recommendation:** Reduce the KPI/metric-tile count materially (merge the two metric rows into one, drop the duplicate Pipeline Value), move the decorative club banner below the fold or remove it, and rewrite the activity feed into plain sentences. Standardize status-pill casing everywhere (Title Case is used more often; make it universal).

### 2. Companies list (`/companies`) and detail (`/companies/[id]`, Google)
**Flagged as likely bugs (see items 3–4, 10 above): the Segment/Size contradiction between summary pills and the edit form; two different Sponsorship Fit scores on the same page; test/QA companies mixed into the live list.**

- List page: every row shows the status **twice** — a gray outlined Title Case pill ("Prospect," "Competitor") immediately next to a solid colored lowercase pill repeating the same word ("prospect," "competitor"). Confirmed via the row's own accessible name, which literally reads "...prospect prospect View →". This is a duplicate badge on all 537 rows.
- The detail page for a single company stacks a genuinely large amount: an Outreach Agent panel (with a "Run Agent" button that will trigger real outbound-adjacent action), a Warm-up Strategy panel, four summary pills, a large inline edit form (not a modal — the full editable Company Details form is always visible), a Company Intelligence block with six sub-tabs, an AI Inventory suggestion card, a Differentiator Analysis card, an Opportunity Gap card, a Contact card, and Proposals/Campaigns summary lists — nothing is collapsed by default.
- **The header row has 5 differently-colored buttons** (All Companies, Campaigns, "+ New Campaign" green, "Generate Campaign" purple, "Create Proposal" blue) with no single one reading as clearly primary.
- **Contact Person fields show plausible-looking placeholder data** ("João Silva," "joao@empresa.com," "+55 41 99999-9999") that could be mistaken for real prefilled values at a glance, since Google in fact has no contact on file (confirmed by the sidebar Contact card separately stating "No contact info — add via edit form").
- **Proposals (3) and Campaigns (3) side-panel lists are truncated to indistinguishability:** two campaigns both truncate to "Google × Coritiba FC — sponso..." (differing only by capitalization of the next hidden letter), so a user cannot tell which is which without opening both.
- **One button, "Analisar," is untranslated Portuguese** in the otherwise-English "Opportunity Gap" card (see Cross-cutting #1).

**Recommendation:** This page needs to become a tabbed or accordion layout (Overview / CRM Details / Intelligence / Outreach) rather than one long stacked scroll — see Redesign Direction #1. Drop the duplicate status pill on list rows. Widen or tooltip-expand the truncated Proposals/Campaigns titles so near-identical names are distinguishable. Replace literal placeholder-looking example text in empty contact fields with a clearly-styled placeholder (e.g., italic gray "No contact on file" instead of a realistic fake name/email).

### 3. Pipeline (`/pipeline`)
**Flagged bug-adjacent, not a UX opinion: the board is not actually a Kanban board.** The page's own copy calls it a "Kanban board" with "Drag a card to move it between stages," and shows 4 stage headers ("1. Contact Lead," "2. Diagnosis & Presentation," "3. Prepare Proposal," "4. Negotiation & Contract") — but the stages render as **full-width sections stacked vertically down the page**, not as side-by-side columns. With most of the 540 leads apparently bucketed into a single stage, that stage's section alone runs for thousands of pixels, producing the 36,000px-tall page noted above. A user cannot see "how many deals are in each stage" at a glance the way an actual Kanban board would show — they have to scroll through what is effectively one very long list, arriving at each stage boundary only after scrolling past everything before it.

- Two of the four headline stat cards read "Not tracked" (Pipeline Value, Revenue Won) in the same bold styling as the real "540" Active Leads figure.
- The "Pipedrive Integration Architecture Ready" info box shows raw field names to end users (see Cross-cutting #5) for an integration that isn't actually connected yet.
- Test/placeholder company names ("Empresa Exemplo," "Outra Empresa," multiple "Banco Itaú Test..." variants) sit directly alongside real prospects like Heineken Brasil and EBANX in the same stage list, with identical row styling.

**Recommendation:** This is the single highest-impact fix on the list. Rebuild as an actual side-by-side column board (4 fixed-width columns, each independently scrollable) rather than stacked full-width sections — this is what "Kanban" means to every user who's used Trello, Pipedrive, or any CRM, and the current implementation actively fights that expectation.

### 4. New Proposal wizard (`/proposals/new`)
Steps 1 (Proposal Type), 2 (Select Company), and 3 (Components) were reviewed.

- **Step 1 lists 10 proposal types in a single flat, ungrouped list**, and the taxonomy genuinely overlaps: "Lei de Incentivo" ("Tax-incentive social project — ESG, community programs, sport development"), "ESG / Community" ("Social impact partnership — youth, environment, inclusion, CSR"), and "Grant / ESG Funding" ("Nonprofit soliciting cause-marketing or CSR funding — impact-led") all reference ESG/CSR/community language in their one-line descriptions, and two of the three even reuse the identical heart icon. A first-time user cannot reliably tell these apart from the copy alone — "Lei de Incentivo" specifically refers to a Brazilian tax-law mechanism, a legal/financial distinction that isn't obvious from the description shown.
- The list also **mixes two different taxonomies in one flat set**: deal-structure type (Sponsorship, Barter, Mixed, ESG, NIL), client-scale type (Local Business vs. National Brand — the same underlying deal, differentiated only by client size), and use-case type (Exhibitor Package, which isn't stadium sponsorship at all). This conflation is why the list feels long without feeling organized.
- **Step 2 (Select Company)** has a clean, small search-plus-4-row picker with a genuinely useful "Intelligence preview" card once a company is selected — one of the better-designed moments in the wizard. But the underlying dropdown renders all 537 companies into the DOM at once (see Cross-cutting #3).
- **Step 3 (Components/inventory)** is a single unbroken page roughly 10,000px tall with 25+ category sections and no filter, search, or "recommended package" shortcut — just a long checklist. Category headers are raw enum text (`LED_BOARD`, confirmed — see Flagged Issue #7), and most line items show no price.

**Recommendation:** Group the 10 proposal types into 2–3 labeled clusters (e.g., "Cash Sponsorship," "Non-Cash / Hybrid," "Social Impact & Grants") rather than one flat list, and disambiguate the three ESG-flavored options with one clarifying sentence each about who they're for. Add a search/filter and a "recommended starter package" option to the inventory step so it isn't a cold 25-section scroll every time.

### 5. Proposal detail page (`/proposals/[id]`, Ambev Brasil — approved)
- **The page opens with an 11-line H1**: the proposal's full marketing-style title ("Verde e Branco de Copo na Mão: Ambev Brasil × Coritiba FC — Proposta de Patrocínio Master de Cerveja no Couto Pereira") rendered at full heading size with no truncation, pushing the actual action toolbar (Duplicate, Save Version, Landing Page, Ver Deck PDF, Enriquecer com IA, Create Share Link) down and forcing it to wrap into a cramped row. A user has to get past 11 lines of bold text before reaching anything actionable.
- Of those 6 toolbar buttons, 2 are Portuguese ("Ver Deck PDF," "✨ Enriquecer com IA" — the latter additionally styled as the one solid-blue "primary" button among otherwise outlined ones) and 4 are English, with no visible pattern for which language a given button gets.
- **The page is roughly 10,450px tall** with 15+ stacked cards: Proposal Content, a mockup-generation panel, a second mockup/image panel, an image gallery, a campaign section, a Brand Assets card, Proposal Flow (the status stepper), Review History, Share Link Protection, Documents, a second "Generated Images" gallery, Review, Execution Brief, a draft outreach email composer, Sponsorship Packages, and an A/B Test section at the very bottom.
- **The single most useful "where does this deal actually stand" element — the Proposal Flow stepper (Draft ✓ → Review ✓ → Approved ✓ → Images ✓ → Contract)** — sits roughly 65% of the way down this 10,450px page, well below a giant title, a full-length "Proposal Content" text block, and several visual/mockup-generation tools. For a staffer who just wants a status check, that's a long scroll to reach the one thing that answers "what's next."
- Metadata line under the title reads "0 sponsor views" for a proposal marked **approved** — worth surfacing more prominently if it's meaningful (an approved proposal the sponsor has never opened is a real signal), rather than sitting in small gray text.

**Recommendation:** Cap the title's rendered size/line count and truncate with a tooltip for the full text. Move the Proposal Flow status stepper to directly under the header, above the fold, on every proposal — it should be the first thing visible, not the fifteenth card. Consolidate the two separate "Generated Images" sections into one.

### 6. Campaigns list (`/campaigns`) and detail — the empty-vs-real comparison James specifically asked for
Covered in full under Cross-cutting #2 above with both example campaigns. Summarizing the list-page-specific findings not covered there:
- The list shows "169 campaigns" total, and every row — real or shell — carries an identical gray "draft" pill.
- Rows with real strategic content additionally show a small colored strategy-type tag ("Loyalty Strategy," "Premium Strategy," "Community Strategy") and a multi-sentence description; shell rows show neither, just the boilerplate one-liner ("Wizard-generated campaign for Google"). This distinction exists in the data today but isn't framed anywhere as a completeness signal — it's incidental, not designed.
- Filtering requires typing into a search box **and** clicking a separate "Apply" button — it is not live/instant, which is easy to miss on first use (confirmed: typing "Havaianas" into the filter box produced no visible change until "Apply" was clicked).
- Static copy under the ideas panel reads "Uses AWS Bedrock — Claude Sonnet" (see Flagged Issue #11).

**Recommendation:** Surface the strategy tag and a content-completeness indicator directly on the list row, not just inside the detail page, so a scanning user doesn't have to open a card to tell a filled campaign from a shell.

### 7. Approvals (`/approvals`) — the Tinder-card queue
This is one of the better-designed screens in the app and worth calling out as a positive pattern, not just critique.
- The single-card review flow (Company, title, truncated description, Reject/Edit/Approve buttons, plus a keyboard-shortcut hint: "→ Approve · ← Reject · E Edit · Drag card to swipe") is focused and clear — one decision at a time, with an obvious set of outcomes.
- One real concern: the top banner states, in small print, that **"no real outbound email has ever left this system unattended: 'sent' today means logging the activity to your CRM, not live delivery."** This is a significant fact — that "Approve" does not currently trigger a real email send — buried in a green info banner's second sentence, at the top of a 173-item queue a staffer is about to work through quickly. If staff believe Approve = "this goes out to the sponsor now," and it doesn't, that gap deserves much more visual weight than small print.
- **173 items in a one-at-a-time swipe queue** (100 proposals, 50 campaigns, 23 emails) with "0 of 173 reviewed" and no visible way to bulk-approve a batch of similar items or skip a type — working through this queue one card at a time could take a genuinely long time.
- The view-mode toggle ("Lista" / "Vista em Cards") is in Portuguese while the rest of the page is English.

**Recommendation:** Keep the card-swipe interaction pattern — it's good. Move the "no real email has been sent" disclosure out of fine print into a persistent, clearly-styled status indicator (e.g., a small badge on every card: "Simulated send" vs. "Live send"). Add a bulk-action path for the Campaigns tab specifically, since 50 of the 173 items are campaigns and campaigns are the ones most likely to be near-duplicates from the "Bulk Industry Campaigns" generator.

### 8. Agents (`/agents`)
This page is also comparatively well done: **"275 item(s) awaiting your review... every agent below writes here, nowhere else"** clearly states the guardrail up front, and each of the six agent cards (Outreach Agent, Negotiation Agent, Pipeline Hygiene Agent, Multi-Channel Sequencer, Renewal Agent, Reporting Agent) describes what it does in one plain sentence plus a "Run from X" or "View on Y" link — a first-time viewer could reasonably understand this page's purpose without help.

- **The headline "275 items awaiting your review" figure directly contradicts the Approvals page's own count of 173** (see Flagged Issue #5) — this undercuts the page's main trust-building claim ("every agent... writes here, nowhere else") since the numbers don't actually match where they're claimed to.
- The Multi-Channel Sequencer card states plainly "WhatsApp/LinkedIn need real API credentials — not built yet" — honest, but written in an internal-engineering-status voice rather than the product's normal copy tone.

**Recommendation:** Fix the undercount/overcount mismatch with Approvals first — it's the one thing on this otherwise-strong page that actively damages credibility. Otherwise, this page's plain-language, single-sentence-per-agent pattern is worth reusing on the Company Intelligence panel and Campaign Strategy sections, which currently favor dense paragraphs over scannable statements.

### 9. Sidebar navigation
Covered in full under Cross-cutting #4.

### 10. Settings pages (Email Flows, Presentation Templates, Team & Roles)
- **Email Flows** (`/settings/email-flows`): a single flow card ("Padrão — Introdução → Follow-up → Negociação") on an otherwise mostly-empty page. Step chips mix languages within a single chip ("Introdução / Outreach"). Copy references "log to Pipedrive" as if that integration were active, though Pipeline page copy elsewhere states Pipedrive is only "Ready to Configure."
- **Presentation Templates** (`/settings/proposal-templates`): the page's own H1 ("Presentation Templates") doesn't match its own breadcrumb ("Settings › Proposal templates") — two different names for the same page, visible in the same viewport. Of the 4 templates listed, one is the real default ("Aliança Estratégica") and **three of the four have "test"/"Test" in their name** — test artifacts make up the visible majority of what should be a small, curated, reusable-template library.
- **Team & Roles** (`/users`): by contrast, this is a clean, well-organized page — a clear permission matrix (4 roles × 11 permissions, all in a straightforward ✓/— grid) and a simple team member table with inline role dropdowns and Deactivate/Reactivate actions. This is a good layout pattern worth reusing elsewhere. Its only issues are the "admin_test" test account sitting in the real 3-person team list, and that this page's sidebar item does *not* double-highlight the way the two `/settings/*` pages above do (see Cross-cutting #4) — the active-state logic is inconsistent between settings pages depending on their URL prefix.

**Recommendation:** Standardize on Team & Roles' layout pattern (clear section headers, a real data table, inline-editable controls) as the model for the other Settings pages, which currently range from sparse (Email Flows) to inconsistently labeled (Presentation Templates).

---

## Redesign direction

Ranked by expected impact versus implementation effort, as requested, so these can be picked up as discrete engineering tasks.

### 1. Rebuild the Pipeline as an actual side-by-side Kanban board (High impact / Medium effort)
The current vertically-stacked-sections implementation directly contradicts the page's own "drag a card between stages" copy and produces a 36,000px page. This is the single most broken *mental model* in the app relative to what every user already expects from a sales pipeline. Fix: four fixed-width columns, each independently scrollable, deal counts and stage-value totals visible in each column header without scrolling.

### 2. Collapse the Company detail page from ~10 stacked cards into a tabbed layout (High impact / Medium effort)
Organize into 4 tabs: **Overview** (summary pills, contact, status — the "am I looking at the right company" glance), **CRM Details** (the editable form, currently always-open), **Intelligence** (the AI analysis, fit scores, differentiator/opportunity panels — currently the longest section), **Outreach** (Outreach Agent, Warm-up Strategy, related Proposals/Campaigns). This directly addresses "is it overwhelming, could a first-time user tell what to do first" — right now the answer is no, because everything is visible and equally weighted at once.

### 3. Introduce one consistent completeness/empty-state signal, used everywhere (High impact / Low-Medium effort)
This single change resolves James's specific complaint plus several related findings (Dashboard's em-dash KPI cards, Pipeline's "Not tracked" cards, Campaigns' indistinguishable shells). Define one small, reusable component — a muted, explicitly-labeled empty state, and a progress indicator for partially-filled records ("Strategy ✓ · Inventory 0/1 · Brief not generated") — and apply it everywhere a record can be incomplete. This is more a design-system task than a rebuild, which is why effort is lower than its impact.

### 4. Cut the sidebar from ~40 items to ~25 by removing Settings-duplicate links and merging near-duplicate items (Medium impact / Low effort)
Remove "Presentation Templates," "Email Flows," "Newsletter Config," and "Perfis de Envio" from top-level nav (they stay reachable via the "Configurações" Settings hub, which already exists and already lists them). Move "Propostas" up next to "Nova Proposta." This is a low-risk, mostly-mechanical change with an outsized effect on how navigable the sidebar feels, and it also removes the double-active-highlight bug for free since those routes won't be duplicated in nav anymore.

### 5. Fix the Approvals/Agents item-count mismatch and move the "simulated send" disclosure out of fine print (Medium impact / Low effort)
Both are small fixes with outsized trust impact: staff currently can't get a consistent number for "how much is in my queue," and staff currently aren't clearly told that approving something doesn't send a real email. Both are copy/data-wiring fixes, not redesigns.

### 6. Finish the i18n coverage so PT/EN actually covers page content, not just the sidebar (Lower immediate impact / High effort)
This is the most expensive item on the list because it requires auditing every hardcoded string across every page (the barter-campaign inventory card alone has ~8 Portuguese strings sitting in an English page). It's ranked last not because it doesn't matter, but because it's a large, mostly-mechanical sweep rather than a structural fix — and it becomes materially more urgent once the platform has actual English-primary tenants (non-Brazilian clubs, nonprofits, conferences) using the same shared components that currently leak Portuguese regardless of the toggle.

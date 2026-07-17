# Coritiba FC Sponsorship Automation — Full System Walkthrough

## 0. What it is
An AI-powered commercial platform that takes Coritiba FC from **finding a sponsor prospect → researching them → generating a tailored proposal → creating realistic sponsor mockups → drafting outreach emails → tracking the deal in a CRM**. It's a single Next.js web app with a Postgres database and several AI/data integrations behind it.

## 1. Technology stack (the moving parts)
- **Frontend + backend:** Next.js 14 (App Router) — pages and API routes live in the same app (`frontend/app`).
- **Database + storage + auth:** Supabase (PostgreSQL, file storage buckets, and user login).
- **Text AI:** AWS Bedrock running **Claude Sonnet 4** — writes proposals, emails, intelligence analysis.
- **Image AI:** OpenAI **gpt-image-2** — jersey/stadium/campaign mockups.
- **Data/enrichment:** Hunter.io (emails), Apollo.io (company + contact data), Apify + SerpAPI (web/Google scraping), logo.dev (company logos), social scrapers.
- **CRM:** Pipedrive (deals, organizations, activities).
- **Hosting:** PM2 keeps the app + an ngrok tunnel running at the public URL.

## 2. Login & security (how access works)
- Every page/API call passes through **middleware** (`middleware.ts`).
- It checks the **Supabase session cookie**. No valid session → UI redirects to `/login`, API returns 401.
- Public exceptions: the login page, health checks, and **public proposal share links** (`/proposals/view/[token]`) so sponsors can view without an account.
- **Roles (RBAC):** admin / sales_rep / approver / viewer control who can do what (managed at `/users`).
- *(This is also the root of the "logged out on button press" bug — a session expiring mid-action.)*

## 3. The data layer (what's stored)
Core Supabase tables: `companies`, `contacts`, `proposals` (+ `proposal_versions`), `campaigns`, `emails`, `email_templates`, `email_sequences` + `email_sequence_enrollments`, `contracts`, `inventory_items`, `proposal_templates`, `newsletters`, `sender_profiles`/`team_members`, `agent_runs`, `image_generation_jobs`, `audit_logs`. Generated files (mockups, campaign images) live in Supabase **Storage buckets**.

## 4. CRM core (the foundation)
1. **Companies** (`/companies`) — 500+ prospect/competitor companies with industry, size, segment, pipeline stage, `logo_url`, and a full AI intelligence profile. Search + filters + CSV export.
2. **Company detail** (`/companies/[id]`) — profile, contacts, proposals, **Sponsorship Fit Score**, **Re-fetch Logo** button, and the **Outreach Agent** panel.
3. **Contacts** (`/contacts`) — decision-makers saved from Hunter/Apollo.
4. **Pipeline** (`/pipeline`) — deal stages.
5. **Contracts** (`/contracts`) — signed deals, renewal alerts, revenue.
6. **Reports** (`/reports`) — revenue vs target, win rate, proposals/month, CSV exports.

## 5. Intelligence & discovery (finding + researching prospects)
- **Enrichment tools** (`lib/intelligence/*`): Hunter (find emails by domain), Apollo (company + people data, returns a logo), Apify/SerpAPI (Google + web scraping), social scraper, competitor engine, domain resolution.
- **Product Discovery** (`/product-discovery`, new): enter a product → scrapes + AI-classifies companies that **sell/manufacture** it across **local/state/national** tiers → scores sponsorship fit + barter potential → optionally auto-saves them as prospect companies.
- **Logo scraping:** via logo.dev (from the company domain) + Apollo. Once `companies.logo_url` is set, it **automatically flows** into the mockup generators. *(Gap we're fixing in E: it isn't auto-scraped on company creation, only on manual/agent action, and it's low-res.)*

## 6. Proposals (the heart of the system)
**A. Creation — the 6-step wizard** (`/proposals/new`):
1. Proposal type (sponsorship / barter / lei de incentivo / mixed / ESG / local / national).
2. Select company.
3. Pick inventory items (live from `inventory_items`, priced by company size; auto-selects package counterparts).
4. Strategy (AI recommends angles based on company profile).
5. Generate → **Bedrock Claude Sonnet 4** writes the full proposal (executive summary, rationale, strategy, pricing narrative) grounded in Coritiba facts.
6. Review.

**B. The proposal page** (`/proposals/[id]`) — the generated content plus intelligence, pricing tiers, brand assets, and the graphics panel.

**C. Editing & presentation** (`/proposals/[id]/view`) — internal CMS editor: edit any text inline, switch among **5 landing-page layouts**, generate images, "**Salvar como template**", print to PDF, and create a **public share link**.

**D. Templates** (`/settings/proposal-templates`, new) — industry-tagged, reusable snapshots of a proposal's pages + image placeholders. *(C in our plan extends this to HTML/PPT upload + bulk auto-customize.)*

**E. Public view** (`/proposals/view/[token]`) — sponsor-facing landing page, view-only, with "Tenho Interesse / Falar com equipe / Agendar reunião" CTAs and view tracking.

**F. Bulk** — `/proposals/bulk` (Tinder-style batch), `/campaigns/bulk`, `/proposals/bulk-approve`.

## 7. Approvals (human gate)
`/approvals` — a Tinder-style queue (approve/reject/edit) for proposals, campaigns, and emails. Nothing goes out without passing this gate.

## 8. Image generation (the mockups) — recently rebuilt
On a proposal's **Graphics panel**, using the sponsor logo (`companies.logo_url` or an uploaded asset):
- **Jersey Mockup** — real Coritiba kit photo + logo → one gpt-image-2 pass, 8 placement zones, per-kit real base photos, optional custom base upload, stop button.
- **Stadium Mockup** — real Couto Pereira photos (LED boards, facade, perimeter), 5 zones.
- **Campaign Creative** — lifestyle/matchday scenes.
- **Pipeline:** preprocess logo (background removal only if solid, upscale small logos) → load base image (downscaled to ≤1536px to avoid timeouts) → send **both images + one concise prompt** to gpt-image-2 → return PNG. **One request, one result** — no QA/retry loops. Uploading a new logo overrides the old one; delete button per asset.
- Also: **AI Image Gen** (`/media-generation`), **Mockup Editor** (`/mockup-editor`, 9 templates), **Asset Library** (`/assets`).

## 9. Email & outreach
- **Generation** (from a proposal) — Bedrock drafts a personalized email; you pick a **flow type**: intro / follow-up / negotiation / barter (each has its own AI prompt + PT-BR template).
- **Templates** (`/settings/email-templates`) — `{{variable}}` + `[Bracket]` support, tagged by flow.
- **Email Flows** (`/settings/email-flows`, new) — build multi-step sequences (intro → follow-up → negotiation/barter) with per-step template + delay; enroll a company; "Run due steps" scheduler.
- **Newsletter** (`/newsletter` + `/settings/newsletter`) — compose + segment recipients.
- **Sending reality (important):** nothing is actually delivered yet. Newsletter marks itself "sent" in the DB; outreach emails are **drafted and logged to Pipedrive as activities** — no live SMTP/Gmail send is wired. *(That's item B — needs Gmail authorization or a Resend/SendGrid key.)*

## 10. The Outreach Agent (autonomous pipeline)
On each company page, "Run Outreach Agent" starts an AI agent (`lib/agents/orchestrator.ts`) that uses Bedrock's tool-calling loop:
1. `enrich_contacts` — Hunter + Apollo find decision-makers.
2. `scrape_company_intelligence` — LinkedIn/web/social signals.
3. `generate_personalized_proposal` — creates a tailored proposal, then **pauses for human approval**.
4. After approval → `generate_outreach_email` → `send_email` (logs to Pipedrive; no live send).
- Runs are streamed live (SSE) and saved to `agent_runs`. It's **supervised** — always one company, always pauses. *(Item D adds a pre-approved, batch auto-run mode.)*

## 11. Integrations & CRM sync
- **Pipedrive** (`lib/pipedrive/*`) — proposals sync to deals/organizations; emails log as activities; `/crm-sync` manages it.
- A **job queue** (`lib/jobs/queue.ts`) handles background CRM syncs.

## 12. System, audit & ops
- **Workflows** (`/workflow-events`) — event log of pipeline runs.
- **Audit** (`/audit`) — every significant action recorded in `audit_logs`.
- **Maintenance** (`/system`) — service health, env checks, Pipedrive status, maintenance actions.
- **Settings / Sender Profiles / Team & Roles** — configuration + RBAC.
- **PM2 + ngrok** — keep the Next.js server and public tunnel alive.

---

## The end-to-end flow in one line
**Discover a prospect (Product Discovery / Companies) → enrich + score (Intelligence, logo scrape) → generate a proposal (Wizard + Claude) → add realistic mockups (gpt-image-2) → approve (Approvals) → draft outreach in a flow (Emails/Flows) → track in Pipedrive → renew via Contracts.** The Outreach Agent can chain the middle steps automatically (supervised today).

---

### The three things we're building today fit in exactly here:
- **E (logos):** auto-populate `companies.logo_url` at creation/discovery + higher-res + bulk → feeds sections 6 & 8.
- **D (pre-approved agent):** batch, no-pause mode of section 10, auto-customizing section 6 per company.
- **C (presentations):** upload HTML/PPT with placeholders and bulk auto-customize — an extension of section 6D.

Want me to go one level deeper on any single part (e.g., exactly how the proposal wizard calls Bedrock, or the image pipeline internals), or shall I proceed to start E?
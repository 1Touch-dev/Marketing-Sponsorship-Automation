# Sponsorship Automation Platform: Competitive Strategy, Product Roadmap & Go-to-Market Plan

*Prepared for James Deller — Coritiba FC Commercial Intelligence Platform*
*Research date: September 2026*

---

## Executive Summary

The platform (58 pages, 145 API endpoints, built on Supabase/Postgres, AWS Bedrock Claude, OpenAI image generation, and Hunter/Apollo/Apify enrichment) already does something **no researched competitor does in one product**: AI prospect discovery + an approval-gated outreach agent + a 7-type AI proposal wizard + AI mockup generation + bilingual UI, unified in a single CRM. That combination is the core differentiator to build the entire strategy around.

Three things need to happen to turn this from "an excellent internal tool for one club" into a category-defining, multi-tenant SaaS business:

1. **Harden it** — the researched failure patterns (11x's hallucination collapse, Gmail's AI-agent sending bans, OAuth-cascade breaches, runaway agent costs) map directly onto exactly the kind of automation this platform runs. Section 7 gives a concrete error-proofing architecture.
2. **Widen it** — repackage the single-club CRM into a multi-tenant platform with niche-specific landing pages and client dashboards for sports clubs, event/ticketing organizers, agencies, and nonprofits, replacing Pipedrive with a self-hosted Twenty CRM core and adding two new agentic teams (Sections 4, 5, 8).
3. **Sell it** — a channel-led go-to-market that uses barter/VIK, agency white-labeling, and league/association group deals to grow faster than a linear direct-sales motion could (Section 9), backed by enterprise-readiness work that unlocks larger accounts (Section 10).

All findings below are grounded in dedicated research passes; every figure and claim carries its source. Full underlying research is saved in the workspace as seven supporting files (competitor profiles, reviews/complaints, target-audience pain points, open-source/GitHub options, MCP servers, failure post-mortems, enterprise/partnership models) referenced throughout.

---

## 1. Competitive Landscape

### 1.1 Competitor set researched

27 real, currently operating products across five categories (full profiles (see competitor_research.md)):

| Category | Competitors |
|---|---|
| Sports sponsorship sales/CRM | Sportsdigita (DIGIDECK), KORE Software (now Two Circles), SponsorPitch, SponsorUnited, Blinkfire Analytics, Zoomph, Relo Metrics (fka GumGum Sports) |
| Sponsorship prospecting/management SaaS | wehave, SponsorCX, Sponseasy, Sponsy, SponsorMyEvent |
| Proposal/pitch-deck automation | PandaDoc, Proposify, Qwilr, Beautiful.ai, SponsorKit |
| Nonprofit/event fundraising CRM | Bloomerang, DonorPerfect, Neon One, Givebutter, Classy (GoFundMe Pro) |
| Event ticketing with sponsorship modules | Eventbrite, Ticket Tailor, RegFox, Cvent, GoFan/PlayOn |

### 1.2 Detailed differentiators and pricing

| Competitor | Positioning | Key Differentiator | Pricing | Weakness |
|---|---|---|---|---|
| [Sportsdigita (DIGIDECK)](https://www.thedigideck.com/sportsdigita/) | Trackable digital sponsorship decks for pro sports | View analytics, embedded video | Contact sales | No CRM integration, rigid templates, weak cross-visitor analytics ([G2](https://www.g2.com/products/sportsdigita-digideck/reviews)) |
| [KORE Software](https://help.koresoftware.com/hc/en-us/articles/5130829820183-Sponsorship-module-overview) | Enterprise sponsorship/CRM suite (now Two Circles) | Deep inventory/rate-card management, LaLiga-scale deployments | Contact sales, enterprise-only | Opaque pricing, near-zero public reviews, heavy implementation |
| [SponsorPitch](https://sponsorpitch.com/how-it-works) | Two-sided sponsorship marketplace | "Pitch Board" — brands respond to posted opportunities | Contact sales | Weak native CRM/deal tracking per users ([G2](https://www.g2.com/products/sponsorpitch/reviews)) |
| [SponsorUnited](https://www.sponsorunited.com/platform) | Sponsorship intelligence & benchmarking database | AI proposal evaluator, verified deal-value benchmarks, white-space analysis | Contact sales | Enterprise-only pricing opacity; almost no public reviews |
| [Blinkfire Analytics](https://www.blinkfire.com/d/pricing/analytics) | Sponsorship exposure/valuation measurement | ML scene/context detection in video/social | Contact sales | Measurement-only, no CRM/proposal layer |
| [Zoomph](https://zoomph.com/rights-holders/) | Independent sponsorship valuation system of record | Cross-org competitive benchmarking, NIL evaluation | Contact sales | Hard-to-interpret analytics per reviewers |
| [Relo Metrics](https://relometrics.com/) | Sponsor exposure measurement (fka GumGum Sports) | Owned/earned social tracking tied to exposure | Contact sales | Manual partner-tagging burden requires support tickets |
| [wehave](https://www.wehave.io/pricing) | All-in-one "SponsorshipOS" | Named AI assistant ("Coach Vic"), transparent SaaS pricing, Data Clean Room | **Free** / **€69/mo** Starter / **€199/mo** Growth / **€499/mo** Pro / Custom Enterprise | Closest direct competitor — still lacks prospect *discovery* and mockup generation |
| [SponsorCX](https://www.sponsorcx.com/about-us/) | Sponsorship CRM + fulfillment tracking | In-app sponsor messaging, artwork approval workflows, free mobile app | Contact sales | No published pricing, no AI |
| [Sponseasy](https://sponseasy.com/pricing) | Guided proposal builder for small orgs/nonprofits | Multi-language content, custom HTML templates | **$29 / $41 / $129** per mo | Small-org focus only, thin CRM |
| [Sponsy](https://getsponsy.com/pricing) | Sponsor ad/campaign management for newsletters/media | Storefronts, ESP/Zapier integrations, data migration service | **$79 / $109** per mo | Niche fit (media/newsletter), not sports |
| [SponsorMyEvent](https://sponsormyevent.com/how-it-works-organizers) | Marketplace + in-platform contracts/invoicing/escrow | Secure payment protection built in | Contact sales | Marketplace model, not a CRM |
| [PandaDoc](https://www.pandadoc.com/pricing/) | General document/proposal workflow + e-sign | CPQ, deal rooms, bulk send | **$19 / $49** per user/mo | Not sponsorship-specific; CRM sync gated to upper tiers |
| [Proposify](https://www.proposify.com/pricing) | Sales proposal design + e-sign + tracking | Reusable content library | Contact sales (Team tier+) | Rigid templates still need designer help |
| [Qwilr](https://qwilr.com/pricing/) | Interactive web-page proposals + embedded payments | QwilrPay embedded payments | Contact sales, usage-based overage | Document-allowance model surprises users |
| [Beautiful.ai](https://www.beautiful.ai/pricing) | AI-native presentation design | Unlimited AI content + image generation, auto-formatting | Contact sales | Not CRM/pipeline-integrated |
| [SponsorKit](https://sponsorkit.pro/) | AI CRM for creator/influencer brand deals | Purpose-built for creator sponsorship niche | n.a. — no pricing page found | Narrow niche (creators, not clubs/events) |
| [Bloomerang](https://bloomerang.com/pricing) | Donor CRM with predictive giving insights | AI-powered volunteer scheduling | Contact sales, ~$1,200–$6,000/yr typical | Weak/clunky reporting per reviewers |
| [DonorPerfect](https://www.donorperfect.com/fundraising-software/pricing-guide/) | Donor/fundraising software (Core/Plus/Pro) | Built-in auction management, crowdfunding module | Contact sales | Reporting requires "a master's degree to extract information" per reviewers |
| [Neon One (Neon CRM)](https://neonone.com/solutions/neon-crm-overview/neon-crm-pricing/) | Nonprofit CRM, revenue-tiered | Grant management, configurable workflow automation | **$99 / $209 / $409** per mo | 2–3 month support response times; $450 surprise export fee reported |
| [Givebutter](https://givebutter.com/pricing) | Free-forever core CRM, tip-based monetization | No mandatory platform fee | **Free** core / contact sales for Plus | Tipping-model confusion cited by donors |
| [Classy (GoFundMe Pro)](https://givingplatforms.com/platforms/classy) | Enterprise peer-to-peer fundraising | "Keep What You Raise" 0% platform fee | 0% platform fee; subscription n.a. | Hard vendor lock-in, no free trial, weak Mailchimp integration |
| [Eventbrite](https://www.eventbrite.com/organizer/pricing/) | General ticketing + sponsored-placement ads | AI event creation | **3.7% + $1.79**/ticket + 2.9% processing | #1/#2 G2 complaints: "expensive," "high fees"; chatbot-only support |
| [Ticket Tailor](https://www.tickettailor.com/en-us/pricing) | Flat-fee ticketing | Nonprofit fee-discount program | **£0.22–£0.60**/ticket flat | Fewer sponsorship-specific features |
| [RegFox](https://www.regfox.com/pricing) | No-monthly-fee registration | Pass-through fee model | Per-registrant fee, no monthly | Thin feature depth above base tier |
| [Cvent](https://www.cvent.com/en/event-management-software/cvent-pricing) | Enterprise event management suite | AI-personalized attendee agendas | Contact sales, overage fees reported | Steep learning curve, enterprise complexity |
| [GoFan/PlayOn](https://gofan.playonsports.com/sponsorships) | Managed single-sponsor placement, revenue-share | Fully agency-sourced sponsorship, zero upfront cost | Undisclosed revenue share | 1/5 BBB rating; duplicate-charge/no-refund complaints |

**No competitor combines** AI prospect discovery, an approval-gated multi-step outreach agent, a 7-type AI proposal wizard (including barter/tax-incentive types), AI-generated sponsor mockups, and bilingual UI in one product — this is the platform's structural white space (full gap analysis (see competitor_research.md)).

### 1.3 Master feature list — all competitor features, prioritized

73 distinct features were catalogued across all 27 competitors. Prioritized into four tiers by how many competitors offer them and how directly they affect revenue/retention:

**P0 — Table stakes (must have to be credible in any category):**
Sponsorship/partnership CRM with pipeline tracking · Inventory management with rate cards · Trackable shareable proposals with view analytics · E-signature · CRM integrations · Flat/transparent pricing tiers · Basic reporting dashboard · Renewal reminders

**P1 — Strong differentiators (drive win-rate and premium pricing):**
AI-powered proposal generation and brand/partner-fit recommendations · Two-sided marketplace (post-and-respond) · Sponsorship exposure/valuation measurement · Proof-of-delivery/fulfillment tracking · White-label sponsor portals · In-app sponsor↔rights-holder messaging · Verified deal-value benchmark database · Embedded payments in proposals (QwilrPay-style) · Artwork/creative approval workflows

**P2 — Category-expanding (open new segments/revenue lines):**
VIK/barter deal tracking · Data Clean Room / advanced data-sharing · Hospitality & ticketing automation tied to sponsorship · Grant management & moves management (nonprofit) · Crowdfunding module · Auction management · AI-personalized attendee agendas · NIL impact evaluation · Chamber-of-commerce-specific prospecting

**P3 — Nice-to-have / low differentiation (commodity, low prioritization):**
PDF export · Multi-language proposal text · PowerPoint import/export · Basic Zapier integration · SOC 2 badge as marketing (necessary but not a feature per se)

---

## 2. Validated Problems by Industry — Target Audiences

Nine segments were researched in depth (full detail (see target_audience_research.md)). Three findings apply industry-wide before segment specifics:

- **Sponsorship ROI measurement is essentially unsolved industry-wide**: only 37% of sponsors have a standardized ROI process ([ANA/MASB](https://www.ana.net/content/show/id/pr-2018-sponsorship-measurement)), only 19% of advertisers are confident they can measure it at all ([Ekimetrics](https://www.ekimetrics.com/articles/sponsorship-roi-the-most-expensive-marketing-investment-brands-still-struggle-to-measure)), and clear ROI reporting drives 40–60% higher renewal rates ([Guidebook](https://www.guidebook.com/glossary/sponsor-roi-at-conferences)).
- **Ticketing fees are now a federal enforcement matter**: the FTC and 7 states sued Live Nation/Ticketmaster in September 2025 over fees reaching 44% of ticket price and $16.4B collected 2019–2024 ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-sues-live-nation-ticketmaster-engaging-illegal-ticket-resale-tactics-deceiving-artists-consumers)); Eventbrite fees now exceed 20% of a $10 ticket ([TicketCrest](https://www.ticketcrest.com/blog/eventbrite-fees-2026-hidden-costs)). Fee transparency is a regulator-validated wedge, not a niche complaint.
- **"One person doing everything" is the dominant staffing reality** across nonprofits, youth leagues, chambers, and minor-league clubs — directly validating an AI-automation value proposition; CCS Fundraising found 33% of nonprofits cite CRM/data issues as a top challenge, up from 15% two years ago ([CCS Fundraising](https://www.ccsfundraising.com/insights/nonprofit-data-management/)).

### Segment prioritization (severity × reachability × ability-to-pay × product-fit, each 1–5, max 20)

| Segment | Severity | Reach | Pay | Product-Fit | Total | Core problem |
|---|---|---|---|---|---|---|
| **Pro & amateur sports clubs** | 4 | 4 | 4 | 5 | **17** | Small generalist staff running multi-million-dollar sponsorship programs off Excel/WhatsApp |
| **Nonprofits & charities** | 5 | 4 | 3 | 4 | **16** | Worsening CRM/data problems (33%, up from 15%) atop a one-person-does-everything staffing model |
| **Conferences & trade shows** | 4 | 3 | 4 | 4 | **15** | Can't prove ROI to sponsors/exhibitors fast enough to drive renewal |
| **Business associations/chambers** | 4 | 5 | 3 | 3 | **15** | Chronic under-staffing + "sponsor fatigue" from one-off asks instead of bundled annual deals |
| **Music festivals & concert promoters** | 3 | 3 | 4 | 4 | **14** | Sponsorship sales and ticketing fee pressure hit simultaneously |
| **Youth/school sports leagues** | 5 | 3 | 1 | 3 | **12** | Most acute emotional pain (87% of managers hate fundraising) but weakest ability to pay ($100–500 typical deals) |
| **Community/cultural events** | 4 | 2 | 2 | 3 | **11** | Fragmented, hard to reach as a single addressable market |
| **Esports orgs** | 3 | 2 | 3 | 3 | **11** | Sponsorship-dependent but volatile, sector funding contraction |
| **Film/arts festivals** | 3 | 2 | 1 | 2 | **8** | Minimal ability to pay, no existing product-fit precedent |

**Implication:** Lead go-to-market with **pro/amateur sports clubs and nonprofits** (proven willingness to pay, existing competitor validation, best product fit today), then expand to **conferences/trade shows and chambers** (easy to reach, good budgets) before touching lower-scoring segments.

---

## 3. Competitor Reviews & Complaints — What Users Actually Hate

23 platforms researched across G2, Capterra, TrustRadius, Trustpilot, BBB, Reddit, and Hacker News (full detail (see competitor_reviews_painpoints.md)). Top 10 cross-cutting pain points, ranked by frequency/severity:

| # | Pain Point | Who exhibits it | Product implication |
|---|---|---|---|
| 1 | Weak, clunky, inconsistent reporting | Pipedrive, DonorPerfect, Bloomerang, Neon CRM, DIGIDECK, Zoomph | One-click answers to real business questions; consistent numbers regardless of who runs the report |
| 2 | Core features locked behind expensive add-ons | Pipedrive, HubSpot, PandaDoc, Salesforce, Qwilr, Cvent | Bundle CRM sync, e-sign, reporting, bulk send into one tier — no upsell wall |
| 3 | Steep learning curve for small teams | Salesforce, HubSpot, Cvent, Pipedrive, Neon CRM | 15–30 minute time-to-first-value; no enterprise-style nested IA |
| 4 | Slow/unresponsive support | Neon CRM (2–3 month email response), Pipedrive, Classy (54-min holds), GoFan | Real human support with committed SLAs even at low price points |
| 5 | Rigid templates still need a designer | DIGIDECK, PandaDoc, Proposify, Qwilr | AI-drafted, on-brand decks out of the box |
| 6 | Support-ticket-dependent config/data entry | Relo Metrics, Zoomph, DonorPerfect | Full self-service configuration, no ticket required |
| 7 | Weak native CRM in point solutions | DIGIDECK, SponsorPitch | Unify pipeline + proposal + analytics in one product |
| 8 | Opaque/escalating/surprise fees | HubSpot, Neon CRM ($450 export fee), Classy, ticketing platforms | Flat, all-in pricing, no hidden export/transaction fees |
| 9 | Contract lock-in / punitive renewal terms | Classy, Salesforce, Pipedrive | Month-to-month terms, real free trial, no-penalty cancellation |
| 10 | Shallow proposal engagement analytics | DIGIDECK, Proposify, Qwilr | Native cross-visitor analytics + automated "gone cold" follow-up nudges |

Also notable: **enterprise-only opacity** (KORE, SponsorUnited, Blinkfire have almost zero public reviews — a wedge for a transparently-priced challenger) and **near-total absence of AI** in sponsorship-specific tools, while where AI does exist (HubSpot, Salesforce Agentforce) reviewers already resent metered/credit-gated pricing for it.

---

## 4. Prioritized Feature Roadmap (v2 — "Better Than All Competitors Combined")

Combining the competitor master list (Section 1.3), review-driven pain points (Section 3), and target-audience gaps (Section 2), here is the prioritized build plan on top of what already exists:

### P0 — Ship first (closes the biggest competitor gaps + review complaints)
1. **Sponsor-facing real-time ROI dashboard** — auto-updating exposure/reach numbers per sponsor, addressing the industry's #1 unsolved pain point (Section 2)
2. **Flat, transparent, self-serve pricing tiers** — publish pricing (unlike KORE/SponsorUnited/SponsorCX) as a trust-building wedge
3. **Native engagement analytics on every shared proposal** (aggregate views, drop-off, time-on-page) + automated "gone cold" re-engagement nudge — a gap in every proposal tool researched
4. **Self-service configuration for non-admin users** — adding a sponsor, tagging inventory, building a report must never require a ticket
5. **Idempotent, auditable billing** with instant itemized receipts (direct response to GoFan/Hometown Ticketing's duplicate-charge complaints)

### P1 — Differentiate hard against incumbents
6. **VIK/barter deal-structuring module**: budget-offset tagging, contract split templates (75/25, 50/50), optional cross-client trade marketplace with a small match fee
7. **Verified deal-value benchmark database** (à la SponsorUnited) — aggregate anonymized deal data across tenants to give every customer market pricing intelligence no single-club competitor can offer
8. **White-space / opportunity-gap finder** — cross-reference a prospect's existing sponsorship portfolio (via AI company intelligence, already built) against category gaps
9. **Embedded payments inside the public proposal share link** (QwilrPay-style) — let a sponsor accept and pay a deposit directly from the proposal page
10. **Proof-of-delivery / fulfillment tracking portal** shared with the sponsor, replacing the "recap deck arrives weeks late" complaint

### P2 — Expand into adjacent revenue lines
11. **Event ticketing module** (Section 6) with sponsorship inline (jersey/LED/scoreboard placements tied to a specific ticketed event)
12. **Grants/moves-management mode** for the nonprofit vertical (toggle CRM fields/workflow to donor-relationship stages instead of sponsor pipeline stages)
13. **Chamber/association bundle mode** — annual bundled sponsorship packages instead of one-off asks, addressing documented "sponsor fatigue"
14. **NIL/creator-deal mode** for college athletics and influencer partnerships (SponsorKit's niche, foldable into the existing proposal wizard as an 8th proposal type)

### P3 — Longer-horizon, high-leverage
15. **Data Clean Room** for advanced first-party data sharing between rights-holder and sponsor (wehave's top-tier feature)
16. **Public MCP server** exposing read-only platform data so n8n/Claude/third parties can build on top of the platform (Section 5)

---

## 5. MCP Server Strategy — Faster Dev, Fewer Custom Integrations

Full research: mcp_server_research.md. The landscape shifted decisively toward "wire, don't build": **11 of 14 core integrations now have official, vendor-hosted MCP servers.**

| Service | Official MCP? | Approach |
|---|---|---|
| Gmail/Google Workspace | Yes ([Google](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server)) | Wire directly |
| Pipedrive → Twenty CRM | Yes, both ([Pipedrive](https://www.pipedrive.com/en/newsroom/pipedrive-launches-native-mcp-server-bringing-crm-workflows-directly-into-ai-assistants), [Twenty](https://github.com/twentyhq/twenty/issues/20296)) | Wire directly during migration |
| Hunter.io | Yes ([hunter.io/mcp](https://hunter.io/mcp)) | Wire directly — covers current enrichment use case exactly |
| Apollo.io | Yes ([Apollo](https://docs.apollo.io/docs/apollo-mcp)) | Wire directly |
| Apify | Yes ([apify/apify-mcp-server](https://github.com/apify/apify-mcp-server)) | **Highest-value wire** — exposes 7,000+ Actors dynamically, letting agents add new data sources without new integration code |
| Stripe | Yes ([stripe/agent-toolkit](https://github.com/stripe/agent-toolkit/tree/main/modelcontextprotocol)) | Wire directly for billing operations exposed to agents |
| Slack | Yes ([Slack](https://slack.com/blog/news/mcp-real-time-search-api-now-available)) | Wire for internal notifications |
| GitHub | Yes ([github/github-mcp-server](https://github.com/github/github-mcp-server)) | Wire for dev team's own AI-assisted engineering |
| Supabase/Postgres | Yes ([supabase/mcp](https://github.com/supabase/mcp)) | Wire for AI-assisted schema/reporting (read-only for agent-facing tools) |
| n8n | Native | Already built into the ecosystem's automation layer |
| WhatsApp Business | **No** — only immature personal-WhatsApp community servers | Build custom against WhatsApp Business Cloud API directly |
| DocuSeal/Documenso (e-signature) | No | Build custom REST integration |
| AWS Bedrock (core text gen) | Ops-only servers, not a fit | Keep direct SDK calls for the Outreach Agent's generation |

**Strategic recommendation:** plan a **read-only public MCP server** for the platform itself within 2–3 quarters — Pipedrive, HubSpot, Salesforce, Twenty, and Dynamics 365 have all shipped one in 2026, and it lets partner agencies/n8n workflows query sponsorship data programmatically, becoming a distribution and stickiness lever.

---

## 6. Go-to-Market: Multi-Niche Expansion Plan

### 6.1 Productize into niche-specific instances

Ship one core platform, multiple front doors:

- **Landing page + onboarding flow per niche**: `/sports-clubs`, `/nonprofits`, `/conferences`, `/chambers`, `/festivals` — each with segment-specific copy, case studies, and default CRM field/workflow presets (sponsor pipeline stages vs. donor moves-management stages vs. exhibitor levels)
- **Client-facing dashboards, white-labeled per tenant** — each customer's sponsors/donors see a branded portal (proof-of-delivery, ROI reporting, proposal history) under the customer's own brand, not the platform's
- **Segment-tuned proposal templates** — the existing "Aliança Estratégica" deck engine gets a template variant per niche (Sponsorship for clubs, Grant/ESG for nonprofits, Exhibitor Package for conferences)

### 6.2 Sequencing (based on Section 2 prioritization)

1. **Wave 1 (Months 1–4):** Pro/amateur sports clubs + nonprofits — reuse nearly all existing Coritiba-built functionality, minimal new feature work, highest product-fit score (17/16 of 20)
2. **Wave 2 (Months 4–8):** Conferences/trade shows + chambers of commerce — add exhibitor-level configuration and bundled-annual-package mode
3. **Wave 3 (Months 8–12):** Festivals/promoters — add the ticketing module (Section 6.3) as the wedge feature
4. **Wave 4 (Month 12+):** Youth leagues, esports, film/arts festivals — only once unit economics support lower-ACV segments (e.g., a lightweight self-serve tier)

### 6.3 Ticketing module — build vs. buy

Rather than building a ticketing engine from scratch, integrate an open-source base (full detail (see opensource_tech_research.md)):

| Option | Stars | License | Fit |
|---|---|---|---|
| [Hi.Events](https://github.com/HiEventsDev/hi.events) | ~3.8–4k | AGPL-3.0 + additional terms | General event ticketing; must retain "Powered by Hi.Events" branding unless commercially licensed |
| [Pretix](https://github.com/pretix/pretix) | ~2.2k | AGPLv3 + additional terms | Better for seated-venue/stadium ticketing — closer fit for sports clubs' matchday ticketing needs |

**Recommendation:** license Pretix commercially (removing AGPL disclosure obligations) for the seat-map/stadium use case, and treat ticketing as a low-margin **acquisition wedge** — mirror Ticket Tailor/Humanitix's free-or-near-free, nonprofit-discounted positioning to get organizations onto the platform cheaply, then monetize the sponsorship CRM and AI-outreach automation as the real, higher-margin product (enterprise_and_partnership_research.md).

---

## 7. CRM Replacement: Twenty CRM + Two New Agentic Teams

### 7.1 Replacing Pipedrive with Twenty CRM

Full research: opensource_tech_research.md.

- **Architecture:** NestJS/React/PostgreSQL, GraphQL + REST + Metadata API — compatible with the platform's existing Postgres/Supabase foundation
- **License — critical decision point:** Core is **AGPL-3.0**; ~240 enterprise modules (SSO, RBAC, billing) are proprietary. AGPL's network-copyleft clause means **white-labeling Twenty directly into a customer-facing SaaS product likely triggers open-sourcing obligations** unless a commercial license is purchased. Internal use (the platform's own back-office CRM) is unencumbered.
- **Community:** ~56,000 GitHub stars, ~717 contributors — healthy, active project
- **Self-hosting cost:** ~$20–50/month VPS
- **Gap vs. Pipedrive/HubSpot:** missing built-in dashboards, PDF generation, marketing automation, telephony — all of which this platform already builds natively (proposal decks, reporting), so the gap is largely irrelevant here
- **Recommendation:** Use Twenty as the **internal CRM backbone** (replacing the Pipedrive sync dependency), but either (a) purchase Twenty's commercial/enterprise license before exposing it as the customer-facing multi-tenant CRM layer, or (b) keep Twenty as an internal ops tool only and continue building the customer-facing CRM UI natively on top of the platform's own Postgres schema — avoiding AGPL exposure entirely. **Recommended: option (b)** — lowest legal risk, and the platform's own CRM UI (companies, contacts, pipeline) is already more purpose-built for sponsorship workflows than generic Twenty tables would be.

### 7.2 Agentic Team 1 — Sponsorship Outreach Automation

Extends the existing 5-step Outreach Agent into a coordinated multi-agent team using a framework like [CrewAI](https://github.com/crewAIInc/crewAI) (MIT license, ~54–55k stars, no copyleft risk, largest ecosystem):

| Agent role | Responsibility | Guardrail |
|---|---|---|
| **Discovery Agent** | Runs product/seller discovery + AI company intelligence to build the prospect list | Rate-limited Apify calls; dedupe against existing CRM |
| **Enrichment Agent** | Hunter + Apollo contact/org enrichment (via their official MCP servers, Section 5) | Multi-vendor failover if one enrichment API is down/rate-limited |
| **Proposal Agent** | Drafts the AI proposal (Bedrock Claude), selects inventory, generates mockups | Every factual claim must trace to a cited, timestamped enrichment field — no unsupported claims (see Section 8, Pattern 1) |
| **Outreach Agent** | Drafts and sequences the email/WhatsApp send | Hard sending-rate ramp, dedicated sending domain, human approval gate before send |
| **Negotiation Agent** | Handles reply classification and drafts negotiation/barter counter-offers | Always routes to human approval before committing to terms |

### 7.3 Agentic Team 2 — CRM Outreach Automation

A parallel team focused on **general CRM pipeline hygiene and multi-channel outreach** (distinct from sponsorship-specific prospecting):

| Agent role | Responsibility |
|---|---|
| **Pipeline Hygiene Agent** | Flags stale deals, missing next-steps, and overdue follow-ups across the whole CRM (sponsorship + donor + exhibitor pipelines) |
| **Multi-Channel Sequencer** | Runs the email-flow/warm-up-sequence engine across email, WhatsApp, and (optionally) LinkedIn, respecting per-channel rate limits |
| **Renewal Agent** | Watches the contracts module's expiry banner (≤15/30/60 days) and auto-drafts renewal proposals from the "Renovar" flow, pausing for approval |
| **Reporting Agent** | Generates the sponsor/donor-facing ROI dashboard updates and monthly report emails automatically |

### 7.4 Unified Post-Setup Automation Team

Once proposals, inventory, and CRM data are fully configured for a tenant, a **third, higher-level orchestrator team** takes over full-funnel automation end-to-end — from prospect discovery through renewal — coordinating Teams 1 and 2 with a single approval queue (reusing the existing Tinder-card `/approvals` UI) rather than duplicating separate queues per team.

---

## 8. Error-Proofing: Lessons From 28 Failed Companies

Full research (28 companies + 8 AI-agent incidents, all sourced): failure_analysis_research.md. Twelve recurring failure patterns map onto specific, concrete safeguards:

| Pattern | Exhibited by | Mitigation to build in |
|---|---|---|
| **1. Hallucinated content sent to prospects** | 11x ($74M/$350M AI SDR collapse), Who Gives A Crap agent, Meta support-agent fake case ID | Every AI claim about a prospect must trace to a cited, timestamped enrichment field; block unsupported claims; automated stale-source fact-check before send |
| **2. Over-reliance on one data vendor** | Proxycurl (sued into shutdown overnight), Astra, Zaplify | Provider-abstraction layer with automatic failover across Hunter/Apollo/Clearbit-class vendors |
| **3. Email deliverability collapse** | 11x (Gmail SMTP rejections), documented Google Workspace AI-agent bans, Salsa Labs | Hard per-mailbox sending-rate ramps, dedicated sending domain separate from primary business domain, real-time bounce/spam-complaint circuit breaker at 0.1–0.3% |
| **4. Approval gates as prompts, not infrastructure** | Meta/OpenClaw (bulk-deleted emails after context compaction lost the instruction), Amazon Strands Agents prompt-injection bypass | Approval gates must be state-machine/workflow-engine enforced, non-bypassable, and audited like an authentication control — not natural-language instructions |
| **5. Runaway automation cost** | $47,000/11-day LangChain retry-loop incident | Hard per-run/per-day spend caps, execution timeouts, automatic kill switch independent of the agent's own logic; real-time spend monitoring, not monthly-invoice discovery |
| **6. OAuth/integration compromise cascades** | Salesloft Drift → Salesforce breach, Klue → 5-company cascade | Short-lived auto-rotating OAuth tokens, automated stale-credential revocation, minimum-scope grants, one-click integration kill switch |
| **7. Single point of failure in backups** | Code Spaces (one compromised credential destroyed prod + backups, killed the company) | Immutable, access-isolated, offsite backups on separate credentials from production infra |
| **8. Trust-fund/liquidity mismanagement** | Flipcause ($29M owed to nonprofits), Lyte, Pollen | Segregate any customer float (ticketing/escrow payments) from operating cash; independent audit |
| **9. Enterprise trust erosion from over-automation** | GodmodeHQ (deal-cycle stalls), Astra, Builder.ai | Position as augmentation with a visible "human takeover" mode in every workflow; conservative, verifiable marketing claims |
| **10. Founder/team conflict** | Astra, Toplyne | Organizational, not technical — clear decision rights before scale pressure hits |
| **11. Poor unit economics** | Homejoy, Zaplify | Price to reflect true AI-inference/enrichment/human-review cost per lead from day one; track cost-to-serve continuously |
| **12. Weak product-market fit** | CB Insights: 42–43% of 431 analyzed startup failures | Validate specific sponsorship workflows with design partners before broad automation; build a defensible data moat (deal-value benchmarks, rights-holder relationships), not a thin LLM wrapper |

**Highest-priority build items from this analysis:** infrastructure-level approval gates (Pattern 4), dedicated-domain deliverability architecture (Pattern 3), and claim-grounding in the Proposal Agent (Pattern 1) — these three alone address the exact mechanism that killed the most directly comparable precedent (11x).

---

## 9. Partnership, Barter & Commission-Free Marketplace Strategy

Full research: enterprise_and_partnership_research.md.

### 9.1 Agency white-label reseller program
License the platform to sponsorship/marketing agencies at a **30–50% wholesale discount off retail seat price**; agencies resell under their own brand to their client roster. This mirrors documented white-label economics (15–40% revenue-share bands) and turns each signed agency into a distribution multiplier without a linear increase in direct sales cost.

### 9.2 League/association "one deal, many organizations"
Follow the **LaLiga/KORE** and **OneTeam/Opendorse** precedents: negotiate a single master agreement with a league or association covering all member clubs, at a blended per-club rate below individual list price. This is the fastest path to Wave-1 scale in the sports-club segment.

### 9.3 Nonprofit channel: TechSoup and association endorsement
Distribute through **TechSoup** (delivered $27B+ in discounted software, up to 90% off) and association-endorsed-vendor programs (à la Community Action Partnership's NCAP model) to reach nonprofits at near-zero direct customer-acquisition cost.

### 9.4 VIK/barter as both a feature and a growth loop
Build the barter/VIK module (already scoped in Section 4, P1 #6) as a **two-sided marketplace with a small match fee** — customers trade sponsorship inventory for goods/services across the platform's tenant base, which (a) solves a documented pain point for nonprofits and lower-division clubs with more inventory than cash-paying demand, and (b) creates a network effect that grows with tenant count.

### 9.5 Fee-free ticketing as a growth wedge
Mirror **Ticket Tailor** and **Humanitix's** free/near-free, nonprofit-discounted ticketing positioning (Section 6.3) to acquire organizations cheaply; the ticketing module is a loss-leader, not a profit center — sponsorship CRM/automation is the monetization layer.

### 9.6 Events/agencies barter-for-exchange in marketplaces
Offer event organizers and agencies **free platform access in exchange for co-marketing** (case studies, referrals, joint webinars) during the early-traction phase, prioritizing marketplaces/directories where the target segments already congregate (chamber directories, league association listings, TechSoup catalog) — this directly operationalizes "free commissions" as a customer-acquisition lever rather than a revenue give-away, since the cost is marketing spend saved, not cash paid out.

---

## 10. Enterprise-Grade SaaS Requirements

Full research: enterprise_and_partnership_research.md. To win larger sports organizations, leagues, and agencies, sequence investment as follows:

1. **SOC 2 Type II first** — $20K–$100K, 6–18 weeks prep, the most universally requested credential ([Sprinto](https://sprinto.com/soc-2/type-2/), [Drata](https://drata.com/grc-central/iso-27001/iso-27001-vs-soc-2))
2. **SSO (SAML + OIDC) and SCIM provisioning** — SCIM absence is a stated hard "no" for many enterprise buyers ([Security Boulevard](https://securityboulevard.com/2026/06/scim-provisioning-for-saas-a-complete-implementation-guide/))
3. **Public subprocessor disclosure page** naming every AI/data vendor explicitly (AWS Bedrock, OpenAI, Hunter, Apollo, Apify) — only 31% of vendors currently do this despite 67% of buyers caring ([SaaSDash](https://saasdash.ai/blog/sub-processor-disclosure-without-losing-deals))
4. **99.9% uptime SLA** as the modal enterprise commitment (64% of $5M+ contracts), with a published status page and defined RPO/RTO
5. **Granular RBAC + full audit logging** — already partially built (Team & Roles, Audit log modules exist); extend to per-tenant scoping
6. **DPA template + CAIQ-Lite answers pre-packaged** as a "security packet" to compress the 60–90 day enterprise procurement cycle ([Zylo](https://zylo.com/blog/software-procurement-process))
7. **AI-specific assurances**: confirm and publish no-training-by-default status for AWS Bedrock/OpenAI usage; the EU AI Act does **not** require labeling AI-generated sales emails (only agents interacting directly with people trigger Article 50(1)) — but publish an AI-use disclosure anyway as a trust signal
8. **ISO 27001** only once EU-heavy deals justify the $30K–$150K, 3-year-cycle cost
9. **Contract terms**: offer 24–36 month multi-year terms with 18–25% prepay discounts and Net 30–45 to match enterprise procurement norms

---

## 11. Business Model Analysis

### Revenue streams (ranked by projected margin and strategic fit)

| Stream | Model | Margin profile | Role |
|---|---|---|---|
| **Core SaaS subscription** (per-tenant, tiered by seats/proposal volume) | Flat monthly/annual tiers, mirroring wehave's transparent €69/€199/€499 structure but adjusted to USD/target markets | High margin | Primary recurring revenue |
| **Agency white-label licensing** | Wholesale seat pricing (30–50% off retail) | Medium margin, high volume | Distribution multiplier (Section 9.1) |
| **League/association master agreements** | Blended per-org rate, annual contract | Medium margin, very high volume per deal | Fast Wave-1 scale (Section 9.2) |
| **VIK/barter marketplace match fee** | Small % fee on matched trades | High margin (near-zero marginal cost) | Network-effect growth loop (Section 9.4) |
| **Ticketing module** | Flat per-ticket fee, undercutting Eventbrite/Ticketmaster | Low margin, loss-leader | Acquisition wedge, not profit center (Section 6.3) |
| **Premium add-ons** (Data Clean Room, white-label sponsor portals, dedicated CSM) | Enterprise tier upsell | High margin | Expansion revenue within existing accounts |
| **Nonprofit channel (TechSoup-distributed)** | Steep discount, high volume | Low margin per seat, near-zero CAC | Segment penetration + goodwill/PR value |

### Cost structure watch-items (from failure analysis, Pattern 11)
AI inference (Bedrock/OpenAI), enrichment API calls (Hunter/Apollo/Apify), and human-review time must be costed **per lead/deal** from day one — not subsidized during growth. Track cost-to-serve per active seat continuously; avoid loss-leader enterprise pilots that can't convert to sustainable list pricing.

### Defensibility / moat
Per the CB Insights failure data (42–43% of startups fail from weak product-market fit / no defensible moat), the platform's moat should be: (a) the **verified deal-value benchmark database** accumulated across tenants (Section 4, P1 #7) — data no single-club competitor can replicate — and (b) the **combined workflow** (discovery → outreach → proposal → mockup → contract → renewal) in one product, which is expensive for a thin LLM-wrapper competitor to copy end-to-end.

---

## 12. Setup Guide — Agentic Outreach Automation

*For a new tenant, once proposals, inventory, and CRM data are configured.*

1. **Connect integrations** via MCP where available (Section 5): Gmail/Google Workspace, Hunter.io, Apollo.io, Apify, Stripe, Slack. Build custom for WhatsApp Business Cloud API and e-signature (DocuSeal/Documenso).
2. **Configure sending infrastructure**: set up a dedicated sending domain (never the tenant's primary business domain), configure SPF/DKIM/DMARC, and set the hard sending-rate ramp (start low, increase gradually) per the Pattern 3 mitigation.
3. **Load inventory and rate cards** into the CRM (jersey placements, LED boards, hospitality packages, ticket tiers if using the ticketing module).
4. **Set approval-gate policy**: choose per-campaign whether Discovery→Enrichment→Proposal runs unattended ("pre-approved" toggle) or pauses for human review at each step — start every new tenant on manual approval for the first 2–4 weeks.
5. **Enable Agentic Team 1 (Sponsorship Outreach)**: launch Discovery Agent on a defined prospect category/geography; Enrichment and Proposal Agents pick up automatically; review the first batch of AI-drafted proposals in the `/approvals` queue before enabling batch/pre-approved mode.
6. **Enable Agentic Team 2 (CRM Outreach)**: turn on Pipeline Hygiene Agent and Renewal Agent immediately (low-risk, high-value); enable the Multi-Channel Sequencer once email deliverability is confirmed stable (no bounces/spam-complaint spikes) for at least 2 weeks.
7. **Enable the unified orchestrator** only after both teams have run cleanly for a full renewal cycle (or 60–90 days), so the end-to-end funnel is validated stage by stage before full automation.
8. **Ongoing monitoring**: daily spend-cap dashboard (Pattern 5), weekly deliverability report (bounce/spam rate), monthly OAuth-token audit (Pattern 6), quarterly backup-restore drill (Pattern 7).

---

## 13. Ad Strategies

- **Regulator-validated fee-transparency angle**: run paid social/search campaigns directly contrasting the platform's flat pricing against the FTC's Ticketmaster fee lawsuit and Eventbrite's 20%+ small-ticket fees — a currently newsworthy, credible hook ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-sues-live-nation-ticketmaster-engaging-illegal-ticket-resale-tactics-deceiving-artists-consumers)).
- **"We measure what 81% of sponsors can't"** — lead marketing with the ROI-measurement statistic (Section 2) as the core value proposition headline for the sports-club and conference segments.
- **Chamber/association co-marketing** — since chambers are the easiest segment to reach (5/5 reachability score), run **joint webinars with chamber federations** rather than paid ads, converting an entire chamber's membership list at once.
- **League/association case studies as social proof** — publish the LaLiga/KORE- and OneTeam/Opendorse-style "one deal, many organizations" wins as flagship case studies to unlock other leagues.
- **Nonprofit-sector content marketing** targeting the exact documented pain points (one-person-does-everything, $450 export-fee horror stories) via Nonprofit Quarterly and r/nonprofit-adjacent channels — comparison content ("Neon CRM vs. [platform]") converts well given how specific and severe those complaints are.
- **Retargeting via the free ticketing wedge** — every organization using the free/near-free ticketing module becomes a warm retargeting audience for the sponsorship CRM upsell.

---

## 14. Gaps and Open Questions

- **WhatsApp Business Cloud API integration** has no mature MCP option — budget custom engineering time here (Section 5).
- **Twenty CRM AGPL licensing** requires a firm legal decision before any customer-facing exposure (Section 7.1) — recommend legal review before committing to option (a) or (b).
- **Ticketing module licensing** (Hi.Events/Pretix AGPL terms) needs a commercial license quote from Pretix before public launch of the ticketing wedge.
- **VIK/barter marketplace** needs a clear tax/accounting treatment per jurisdiction (already partially handled for Brazil's Lei de Incentivo, but barter-marketplace-wide trades across tenants raise new questions) — recommend a scoped legal/accounting review before opening the cross-tenant marketplace.
- **Pricing for the youth-league segment** ($100–500 typical deal sizes, Section 2) may require a genuinely free or near-free self-serve tier to be viable at all — worth a dedicated pricing experiment before committing engineering resources to that segment.
- **AI-agent cost monitoring tooling** (Pattern 5 mitigation) is not yet specified as a concrete build — recommend evaluating existing LLM-ops cost-monitoring platforms (e.g., Helicone, LangSmith) rather than building this in-house.

---

## Supporting Research Files

- Competitor profiles, pricing, master feature list (see competitor_research.md)
- Competitor reviews & complaints, cross-platform pain points (see competitor_reviews_painpoints.md)
- Target audience segments & pain points (see target_audience_research.md)
- Twenty CRM deep-dive & monetizable open-source repos (see opensource_tech_research.md)
- MCP server landscape & dev strategy (see mcp_server_research.md)
- Failed-company postmortems & failure patterns (see failure_analysis_research.md)
- Enterprise SaaS requirements & partnership/barter models (see enterprise_and_partnership_research.md)

# Infrastructure Vendor Research — Email Sending, Web Research Tooling, CRM

Status: research + recommendations, produced 2026-09-23 in response to James's explicit asks
("find alternative for most scalability" on email sending, "alternatives that are more
scalable... or dedicated subscriptions" on the Apify cap, "replace this with Twenty CRM" on
Pipedrive). No infrastructure has been changed — this is the research and a recommendation,
not an implementation. Every figure below is from a live web search run today; sources are
listed under each section rather than collected at the end, so each claim stays traceable.

---

## 1. Real email sending — provider recommendation

### Current state
`lib/gmail/client.ts` has OAuth scaffolding for a single Gmail account, but nothing in the
codebase actually calls a live send API yet — every "send" path today drafts the email and logs
a Pipedrive activity instead. This is Pattern 3 from `master_report.md`'s hardening list, and the
dedicated-sending-domain work (SPF/DKIM/DMARC, rate ramp, bounce circuit breaker) is already
planned regardless of which provider gets picked — so provider choice doesn't change that work,
it only changes which API the send call hits.

### Options compared

| Provider | Pricing (2026) | Scaling ceiling | Deliverability | Fit notes |
|---|---|---|---|---|
| Gmail (personal/Workspace account) | Free, but Google enforces a ~2,000/day send cap per account and treats programmatic sending as a spam-risk signal | Low — this is the one option that structurally cannot scale to real SaaS volume | Good at low volume, degrades fast if flagged | Fine for the current single-tenant pilot, not viable as the platform grows tenants |
| Amazon SES, classic à la carte | $0.10 per 1,000 emails, no monthly fee, no per-tenant seat cost | Effectively unlimited — this is what powers a large share of the transactional-email industry at massive scale | Requires the platform to build its own reputation (exactly the SPF/DKIM/DMARC/rate-ramp work already planned) | Already on AWS for Bedrock; same account, same billing relationship |
| Amazon SES, new bundled tiers (introduced July 21, 2026) | Essentials: $0.16/1,000, no monthly fee. Pro: $105/mo + $0.22/1,000. Enterprise: $500/mo + $0.23/1,000 | Same ceiling as à la carte, bundles in dedicated IPs/validation at the higher tiers | Same underlying infrastructure | Not worth it unless dedicated IPs or built-in validation are needed on day one — à la carte stays cheaper at every volume this platform will hit for a long time |
| Postmark | $15/mo for 10,000 emails, $55/mo for 50,000 | Real ceiling — priced and built for transactional-only, not designed as a high-volume workhorse | Best-in-class by independent measurement (Mail-Tester, GlockApps) | Worth it specifically if inbox placement becomes a measured problem, not a starting choice |
| SendGrid | $19.95/mo for 50,000, $89.95/mo for 100,000 | Real ceiling, priced per tier | Mid-pack, reputation issues have been a recurring complaint | No clear advantage over the other options for this use case |
| Resend | 3,000/mo free, $20/mo for 50,000 (includes React Email templating) | Newer platform, smaller-scale proof points than SES | Good, unproven at very high volume | Genuinely nice developer fit for a Next.js app specifically (React Email), but "most scalability" was the explicit ask, and SES has the longer track record at real scale |

### Recommendation
Amazon SES, classic à la carte billing (not the new bundled tiers), is the most scalable option
by a clear margin — no per-tier ceiling, cheapest at every volume, already on the same cloud
account as the rest of this platform's infrastructure. Its weaker out-of-the-box deliverability
compared to Postmark is not a real downside here, because the reputation-hardening work SES
needs (dedicated domain, SPF/DKIM/DMARC, rate ramp, bounce/complaint circuit breaker) is exactly
the Pattern 3 hardening work already scoped and waiting on a sending decision — it was never
going to be skipped regardless of provider. This is a recommendation pending sign-off, not a
decision — flagged back to James rather than assumed.

Sources: [Email API Pricing Comparison (buildmvpfast.com)](https://www.buildmvpfast.com/api-costs/email), [Resend vs Amazon SES vs Postmark (buildmvpfast.com)](https://www.buildmvpfast.com/blog/resend-vs-ses-vs-postmark-transactional-email-deliverability-saas-2026), [Amazon SES Pricing 2026 (campaignhq.co)](https://blog.campaignhq.co/amazon-ses-pricing-2026/), [SES vs SendGrid vs Mailgun vs Postmark vs Resend (emailsendx.com)](https://emailsendx.com/blog/amazon-ses-vs-sendgrid-vs-mailgun-vs-postmark-2026)

---

## 2. Apify alternatives — scoped to what's actually used

### Current state
The platform's real Apify usage is narrower than "prospecting tooling" broadly — checked the
code directly: `lib/intelligence/apify.ts` only calls two Actors, `apify/google-search-scraper`
(SERP results, explicitly built to replace an earlier SerpAPI dependency — see
`app/api/intelligence/serp/route.ts`) and `apify/website-content-crawler` (deep JS-rendered
crawling for company research). Both already fail over gracefully to AI-only mode when Apify is
unavailable. The $600.57/$600 cap that's currently blocking research results is on the account
as a whole, not per-Actor.

### Options compared

| Option | Pricing (2026) | Fit for this platform's actual usage |
|---|---|---|
| Raise the existing Apify cap, or wait for the Oct 8 reset | No new integration work | Zero-effort unblock; doesn't address the "more scalable" ask |
| Apify Enterprise / dedicated capacity | Custom, sales-negotiated — no public number found | This is literally the "dedicated subscription" James asked about, but pricing isn't published; would need a real sales conversation to get a number to compare against |
| Firecrawl | Hobby $16/mo for 5,000 pages; outputs clean markdown natively | Specifically relevant for the `website-content-crawler` replacement — crawled content feeds directly into AI generation prompts, and Firecrawl's markdown-native output is reported to cut token consumption by roughly two-thirds versus raw HTML, which is a real, compounding cost saving on top of the API switch itself |
| ScraperAPI | From $49/mo | General-purpose, no specific advantage for this platform's narrow two-Actor usage |
| Zyte API | $0.13 per 1,000 simple requests, pay-as-you-go | Cheapest entry point found, worth a look for the SERP-scraping half specifically |

### Recommendation
Two separate, smaller decisions rather than one "replace Apify" decision, since the platform's
real usage is genuinely two distinct jobs: for the immediate unblock, raise the cap or wait for
the October 8 reset — there's no engineering work either way. In parallel, evaluate Firecrawl
specifically as a replacement for the `website-content-crawler` Actor, not the whole Apify
integration — the token-cost savings on AI generation make this worth a real trial even before
the cap becomes a recurring problem. Apify's own Enterprise/dedicated tier is worth a real sales
conversation if James wants a firm number to compare against, since nothing public exists to
compare against otherwise.

Sources: [Apify Alternatives (firecrawl.dev)](https://www.firecrawl.dev/blog/apify-alternatives), [Best Apify Alternatives (scraperapi.com)](https://www.scraperapi.com/blog/apify-alternatives/), [Apify Pricing 2026 (checkthat.ai)](https://checkthat.ai/brands/apify/pricing), [Web Scraping Pricing Guide (use-apify.com)](https://use-apify.com/blog/web-scraping-pricing-guide-all-platforms)

---

## 3. Twenty CRM — self-hosting and an internal-only integration design

### The legal question still governs this
The AGPL question sent to counsel (Question 1/2 in the legal packet) is specifically about
whether any customer-facing exposure of Twenty CRM counts as "conveying" under AGPL-3.0's
network-copyleft clause. Nothing below changes that — this section is architecture research and
a design for the lower-risk fallback (Option B: internal-only, never customer-facing) so that
work is ready to move fast whichever way legal answers, not a decision to proceed.

### Self-hosting facts
Twenty's self-hosted stack is four containers — the app, a background worker, PostgreSQL, and
Redis — behind a reverse proxy with TLS. Documented minimum is 2GB RAM; an 8GB VPS
(roughly $30/mo) is the realistic recommendation for the full Docker Compose stack. No seat
fees on the self-hosted path — cost is just the server. The core (companies, people,
opportunities, custom objects/fields, kanban/table views, GraphQL + REST APIs, no user limit) is
AGPL-3.0 and free. SSO, SAML, and row-level permissions specifically live in a separate
Enterprise package that's proprietary and priced the same whether hosted on Twenty's cloud or
self-hosted — meaning even the internal-only path doesn't get those specific features for free.

### What an internal-only integration would look like
Mirrors the existing Pipedrive sync pattern (`lib/pipedrive/sync.ts`) rather than inventing a new
shape: a sync layer that pushes companies/deals from this platform into Twenty's GraphQL API for
internal back-office visibility, with no code path anywhere that lets a sponsor, donor, or any
non-platform-user account reach Twenty directly — no customer-facing portal view, no public API
route, no embedded widget. Twenty would sit on its own small internal server, not exposed to the
internet the way the main app is via ngrok. This mirrors the AGPL "internal use is free and
unencumbered" reading that came out of the original research, but that reading is what needs
legal confirmation, not something to treat as settled by an engineering judgment call.

### Recommendation
This design is ready to build once James picks a path from the two offered earlier: wait for
counsel's answer, or start this internal-only version now as the explicitly lower-risk option
while waiting. Not starting either without that confirmation.

Sources: [Twenty Self-Host docs](https://docs.twenty.com/developers/self-host/self-host), [Self-Hosting Twenty CRM Guide (dev.to)](https://dev.to/raju_gangitla_91920e1427f/self-hosting-twenty-crm-a-complete-guide-559n), [Twenty CRM on AWS (taskrhino.ca)](https://www.taskrhino.ca/blog/twenty-crm-aws-self-hosting/)

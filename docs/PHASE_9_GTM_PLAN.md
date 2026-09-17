# Phase 9 — Go-to-Market Execution Plan

Status: **planning deliverable**, produced under the "finish all" instruction (2026-09-17) covering
Phase 9's non-blocked scope from `PLATFORM_ROADMAP.md`. Every claim below is traced to a specific
`master_report.md` section — nothing here is invented, per the project's standing claim-grounding
discipline (the same rule enforced in AI-generated proposal copy).

**Not included here** (explicitly out of scope for this pass):
- Niche landing pages as shipped, routable Next.js pages with lead-capture forms wired to the CRM —
  this doc supplies the copy; building the actual public marketing site (new route group, SEO,
  analytics, form backend) is a separate, larger engineering task not yet scoped or authorized.
- White-labeled client-facing dashboards, segment-tuned proposal template variants — feature-build
  items, tracked as their own `PLATFORM_ROADMAP.md` Phase 9 checkboxes, not planning-doc content.
- Anything requiring a real external commitment this session can't make: the Pretix commercial
  license quote (ticketing, Section 6.3), TechSoup enrollment (Section 9.3), or actual ad spend/account
  creation (Section 13) — these need James, not engineering judgment.

---

## 1. Wave Sequencing Plan (`master_report.md` §6.2, grounded in §2's segment scoring)

The source report scores nine segments on severity × reach × ability-to-pay × product-fit (max 20).
Sequencing follows that ranking, not alphabetical or arbitrary order:

| Wave | Months | Segments | Score | Why this grouping |
|---|---|---|---|---|
| **1** | 1–4 | Pro/amateur sports clubs (17), Nonprofits & charities (16) | 17, 16 | Reuses nearly all Coritiba-built functionality as-is; highest product-fit scores in the whole set; sports clubs already have a working, live reference implementation (this platform) |
| **2** | 4–8 | Conferences & trade shows (15), Business associations/chambers (15) | 15, 15 | Tied-highest of the remaining segments; chambers score a perfect 5/5 on reachability (easiest segment to reach as a single addressable market, §2) — cheapest wave to acquire into |
| **3** | 8–12 | Music festivals & concert promoters (14) | 14 | Sponsorship sales and ticketing fee pressure hit simultaneously (§2) — this is also where the fee-free ticketing wedge (§6.3, §9.5) becomes relevant as an acquisition tool, so Wave 3 should not start before the ticketing module's legal question (Pretix commercial license, `PLATFORM_ROADMAP.md` §6 Q4) is resolved |
| **4** | 12+ | Youth/school sports leagues (12), Esports orgs (11), Community/cultural events (11), Film/arts festivals (8) | 12, 11, 11, 8 | Only pursued if unit economics support a lightweight self-serve tier — youth leagues have the most acute emotional pain (87% of managers hate fundraising, §2) but the weakest ability to pay ($100–500 typical deals, §2); this is explicitly the segment flagged in §14 as needing a dedicated pricing experiment before any engineering investment |

**Gate between waves**: don't open Wave *n+1* until Wave *n*'s segment has at least one converted paying
tenant validating the niche-specific configuration (CRM field presets, proposal template variant) works
in practice — mirrors the platform's own Phase 3 "validate before automate" discipline applied to GTM
instead of engineering.

**What Wave 1 concretely requires that doesn't yet exist**: a nonprofit-specific CRM preset (donor
moves-management stages instead of sponsor pipeline stages, §4 P2 #12) and a Grant/ESG proposal
template variant (§6.1). Sports clubs need neither — this platform already *is* that configuration.
This is why Wave 1 is described as "minimal new feature work": half of it is already done.

---

## 2. Ad Strategy (`master_report.md` §13)

Six angles from the source report, each mapped to the wave/segment it targets and the concrete proof
point it should use — no ad copy here invents a statistic beyond what's cited in the report:

| Angle | Target | Proof point (cite exactly, don't round or embellish) | Channel |
|---|---|---|---|
| **Fee-transparency vs. Ticketmaster/Eventbrite** | Wave 3 (festivals) once ticketing ships | FTC's Sept 2025 suit against Live Nation/Ticketmaster over resale/fee practices; Eventbrite fees exceeding 20% of a $10 ticket | Paid social/search, timed to stay newsworthy |
| **"We measure what most sponsors can't"** | Wave 1–2 (sports clubs, conferences) | Only 37% of sponsors have a standardized ROI process (ANA/MASB); only 19% of advertisers are confident they can measure ROI at all (Ekimetrics) — use as headline hook, not a made-up percentage | Sports-club and conference trade press, LinkedIn |
| **Chamber co-marketing webinars** | Wave 2 (chambers) | Chambers score 5/5 on reachability (§2) — a single chamber federation webinar can reach an entire membership list at once | Owned + chamber-federation channel, not paid |
| **League/association case studies** | Wave 1 expansion within sports clubs | Published only once a real "one deal, many clubs" master agreement exists (§9.2) — this is a proof-driven angle, not launchable until that first deal closes | Case-study content, inbound |
| **Nonprofit-sector content marketing** | Wave 1 (nonprofits) | CCS Fundraising: 33% of nonprofits cite CRM/data issues as a top challenge, up from 15% two years ago; Neon CRM's documented $450 export-fee complaint as a named comparison point ("Neon CRM vs. [platform]") | Nonprofit Quarterly, nonprofit-adjacent forums |
| **Ticketing-wedge retargeting** | Wave 3+ | Every org using the free/near-free ticketing module becomes a warm retargeting audience for the sponsorship CRM upsell — this is a mechanism, not a launch-day angle; only active once the ticketing module and Wave 3 both exist | Retargeting pixel on the ticketing product |

**Sequencing note**: only two of the six angles (nonprofit content marketing, "we measure what sponsors
can't") are usable at Wave 1 with zero new product dependencies. The other four are correctly gated
behind the artifact they depend on (a live ticketing module, a signed league deal, chamber-segment
launch) — do not run ad copy referencing capabilities that don't exist yet.

---

## 3. Agency White-Label Reseller Program — Terms Draft (`master_report.md` §9.1, §11)

The report specifies the economics (30–50% wholesale discount, mirroring documented 15–40%
revenue-share bands) but not contract terms — this is a first draft for James/legal to react to, not a
final offer.

**Structure**: wholesale seat licensing, not pure revenue share — the agency buys seats at a discount
off retail list price and resells under its own brand to its client roster (§9.1).

| Term | Draft position | Rationale |
|---|---|---|
| Wholesale discount | 30% at entry tier, up to 50% at volume (scales with committed seat count) | Matches the report's stated 30–50% band exactly — no invented numbers |
| Minimum commitment | Annual contract, minimum seat count TBD by James (needs real per-seat retail pricing, which doesn't exist yet — Phase 12 is unbuilt) | Can't set a dollar minimum before Phase 12 (billing) ships real tier pricing |
| Branding | Full white-label: agency's logo/domain on the client-facing dashboard (§6.1's white-labeled portal feature, not yet built) | Program is not sellable until the white-label dashboard item ships |
| Support | Platform provides tier-2 support to the agency; agency owns tier-1 (its own client relationship) | Standard reseller support split, avoids the agency becoming a pure pass-through |
| Exclusivity | Non-exclusive by default; a regional/vertical exclusivity add-on could be a future negotiating lever, not offered at launch | Keeps optionality open for multiple agencies per region/niche |
| Term length | 12-month initial, auto-renew | Matches the "multi-year enterprise term" norm from §10 without over-committing at reseller scale |

**Hard blocker before this can be offered to a real agency**: the white-labeled dashboard (§6.1) and
Phase 12 billing (real seat pricing) both need to exist first — this section is terms-drafting so the
conversation with James/legal can start now, not a signal that the program is launch-ready.

---

## 4. League/Association Master-Agreement Terms — Terms Draft (`master_report.md` §9.2, §11)

Same caveat as above: draft for internal discussion, not a final offer. Structure per the report:
"single master agreement with a league or association covering all member clubs, at a blended
per-club rate below individual list price" (§9.2), following the LaLiga/KORE and OneTeam/Opendorse
precedents named in the source research.

- **Pricing**: blended per-club rate, discounted below individual list price — exact discount % needs
  Phase 12 real pricing to be set meaningfully; do not quote a number until then.
- **Onboarding**: staged rollout across member clubs (not all-at-once) — mirrors the platform's own
  "start every new tenant on manual approval for the first 2–4 weeks" discipline (§12 setup guide,
  item 4) applied at the multi-club level.
- **First target**: this is explicitly the fastest path to Wave-1 scale in the sports-club segment
  (§9.2) — should be pursued in parallel with, not after, individual-club Wave 1 sales.

---

## 5. Landing-Page Copy — Niche Front Doors (`master_report.md` §6.1, §2, §3)

Copy only (per the scope note above — not wired to real routes yet). Each niche's copy leads with its
own highest-scoring pain point from §2 and its own competitor-complaint angle from §3, not generic
copy reused across segments.

### `/sports-clubs`
> **Run your sponsorship program like it's worth millions — because it is.**
> Most sponsorship programs at pro and amateur clubs are run by a small generalist staff off Excel and
> WhatsApp, managing multi-million-dollar relationships with no dedicated tooling. [Platform] gives you
> AI-drafted proposals, a real-time sponsor ROI dashboard, and one-click reporting — no design team,
> no spreadsheet, no dropped follow-up.
> *Built for clubs, proven in production — not a generic CRM bolted on afterward.*

### `/nonprofits`
> **You're not understaffed because you're bad at this. The tools are.**
> One person doing everything is the norm, not the exception, for nonprofit sponsorship and donor
> relations — and CRM/data problems are getting worse, not better (33% of nonprofits now call it a top
> challenge, up from 15% two years ago). [Platform] replaces the spreadsheet-and-sticky-notes system
> with AI-assisted donor/sponsor tracking, grant-ready reporting, and proposals that don't need a
> designer. No $450 surprise export fee, ever.

### `/conferences`
> **Prove ROI to your sponsors before they ask.**
> Only 19% of advertisers are confident they can measure sponsorship ROI at all. If your renewal
> conversation starts with "let me pull that together," you've already lost leverage. [Platform] gives
> every sponsor and exhibitor a live, branded portal showing real exposure and engagement numbers —
> so your renewal pitch is a formality, not a scramble.

### `/chambers`
> **Stop asking your members one deal at a time.**
> Chronic under-staffing plus "sponsor fatigue" from constant one-off asks is the defining problem for
> business associations. [Platform] bundles annual sponsorship packages so you pitch once, not
> quarterly — and reach your entire membership through one relationship, not a hundred individual
> conversations.

### `/festivals`
> **Sponsorship and ticketing fees are both under pressure. Fix both at once.**
> Regulators are already moving on ticketing fees — the FTC sued Live Nation/Ticketmaster in 2025 over
> resale and fee practices. [Platform] pairs fee-free/near-free ticketing with real sponsorship
> automation, so you're not paying platform margin on either side of your event.
> *(Ship only once the ticketing module itself exists — see §6.3/§9.5; this copy should not go live
> before the product it promises.)*

---

## Open items this plan surfaces (not decided here — flagging for James)

1. Wave 1 needs two feature items before it's truly ready: nonprofit CRM preset (donor
   moves-management stages) and a Grant/ESG proposal template variant. Neither is built yet.
2. The reseller and league-agreement terms both need Phase 12 (real seat pricing) to quote actual
   numbers — right now they're structural drafts, not offers.
3. Two of the six ad angles (league case studies, ticketing-wedge retargeting) are correctly blocked
   on artifacts that don't exist yet (a signed league deal, a live ticketing module) — don't let ad
   spend get ahead of the product.
4. The `/festivals` landing copy explicitly should not ship before the ticketing module does, since it
   promises a capability that isn't built — flagged inline above so it doesn't get published early by
   mistake.

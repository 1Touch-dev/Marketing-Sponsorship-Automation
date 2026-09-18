/**
 * Centralised prompt templates — v5.0.0
 *
 * PROMPT_VERSION is bumped whenever a prompt changes so that
 * campaigns / proposals / emails can record which prompt generated them.
 *
 * v5.0.0:
 *  - Grounded in official Coritiba FC Brand Guide 2026 (exact HEX colors, Switzer typography)
 *  - Grounded in Manual de Aplicação Patrocinadores 2026 (jersey cm specs, stadium asset inventory)
 *  - Official brand colors: #005742 (Verde Coxa), #FFFFFF (Branco), #000000 (Preto)
 *  - Official typography: Switzer (primary), Inter (body fallback)
 *  - Official jersey max widths referenced in image/creative prompts
 *
 * v5.1.0:
 *  - Phase 2 (master_report.md 7.2): optional per-call tone override
 *    (warm/formal/urgent) on outreachEmailPrompt/negotiationEmailPrompt/
 *    barterEmailPrompt — replaces the previously hardcoded tone line when set.
 */

export const PROMPT_VERSION = "v5.1.0" as const;

/** Phase 2 — tone control per email flow. */
export type EmailTone = "warm" | "formal" | "urgent";

const TONE_INSTRUCTIONS: Record<EmailTone, string> = {
  warm: "Tone: warm, friendly, relationship-focused — write as if reaching out to a valued partner, not a cold prospect.",
  formal: "Tone: formal, precise, corporate — appropriate for a conservative enterprise decision-maker; avoid casual language.",
  urgent: "Tone: urgent but professional — convey genuine time-sensitivity (e.g. a closing window or limited inventory) without sounding pushy or desperate.",
};

export interface CompanyContext {
  company_name: string;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Phase 4 (multi-tenancy) — Club Context, tenant-parameterized
// ---------------------------------------------------------------------------
/** Mirrors lib/tenants/types.ts's Tenant shape, duplicated narrowly here to
 *  avoid a circular import (lib/tenants/current.ts doesn't need to know
 *  about prompts.ts). Keep in sync if TenantClubFacts/TenantBranding change. */
export interface ClubContextInput {
  club_facts: {
    club_name: string;
    short_name?: string;
    nickname?: string;
    stadium_name?: string;
    city?: string;
    state?: string;
    country?: string;
    founded_year?: number;
    follower_count?: string;
    market_context?: string;
    rival_clubs?: string[];
    typical_attendance?: string;
    inventory_highlights?: string[];
    /** Tenant-specific hard rules an AI-generated visual/copy must never
     *  violate (e.g. crest usage rules, forbidden colors). Free-form since
     *  every club's brand guide constraints differ. */
    brand_rules?: string[];
  };
  branding: {
    primary_color?: string;
    secondary_color?: string;
    typography?: string;
  };
}

/**
 * Was a static CORITIBA_CONTEXT constant hardcoding every fact about
 * Coritiba FC directly into the string. Migration 0047 (Phase 4) moves
 * these facts onto the `tenants` table; this function rebuilds the same
 * instruction block from whichever tenant's facts are passed in, with
 * graceful generic fallbacks for fields a new tenant hasn't configured
 * yet (jersey cm specs, exact inventory line items) rather than assuming
 * every club has Coritiba's exact stadium/manual details.
 */
export function buildClubContext(tenant: ClubContextInput): string {
  const f = tenant.club_facts;
  const clubName = f.club_name;
  const nickname = f.nickname ?? f.short_name ?? clubName;
  const stadium = f.stadium_name ?? `${clubName}'s home stadium`;
  const location = [f.city, f.state, f.country].filter(Boolean).join(", ") || "its home market";
  const primaryColor = tenant.branding.primary_color ?? "the club's primary brand color";
  const secondaryColor = tenant.branding.secondary_color ?? "the club's secondary brand color";
  const rivals = f.rival_clubs ?? [];
  const inventory = f.inventory_highlights?.length
    ? f.inventory_highlights.map((i) => `  * ${i}`).join("\n")
    : "  * Jersey/kit branding, stadium LED/signage, digital & social media, community programs (confirm exact inventory with the club before finalizing specific placements)";

  return `
CLUB CONTEXT — ${clubName.toUpperCase()} (NON-NEGOTIABLE):
ALL proposals, campaigns, activations, and stadium references MUST center on:
- Club: ${clubName}${f.nickname ? ` (also known as "${f.nickname}")` : ""}
${f.founded_year ? `- Founded: ${f.founded_year}\n` : ""}- Home stadium: ${stadium}${location !== "its home market" ? `, ${location}` : ""}
- Location: ${location}
- Colors: ${primaryColor}${tenant.branding.secondary_color ? `, ${secondaryColor}` : ""} — use exact configured brand colors, never approximate
${tenant.branding.typography ? `- Typography: ${tenant.branding.typography}\n` : ""}${f.follower_count ? `- Digital reach: ${f.follower_count}\n` : ""}${f.typical_attendance ? `- Typical attendance: ${f.typical_attendance}\n` : ""}${f.market_context ? `- Market context: ${f.market_context}\n` : ""}- Inventory available to sponsors:
${inventory}
${f.brand_rules?.length ? `\nBRAND RULES (NON-NEGOTIABLE):\n${f.brand_rules.map((r) => `- ${r}`).join("\n")}\n` : ""}${rivals.length > 0 ? `
COMPETITOR EXCLUSION — ABSOLUTE RULE:
NEVER mention, recommend, or reference these clubs as sponsorship targets:
${rivals.map((r) => `- ${r}`).join("\n")}
Any such reference would be commercially damaging and is strictly forbidden.
` : ""}
Global/international campaign examples (Red Bull, Nike, Heineken, etc.) may ONLY be used as:
- Strategic inspiration and methodology examples
- Internal benchmarking
NEVER as alternative club recommendations.
`;
}

/** Coritiba's exact facts, matching migration 0047's seed row — used as the
 *  default wherever a caller hasn't been updated yet to pass a real tenant
 *  through (transitional; every call site should eventually pass the
 *  requesting user's actual tenant instead of this constant). */
export const CORITIBA_CLUB_CONTEXT_INPUT: ClubContextInput = {
  club_facts: {
    club_name: "Coritiba Foot Ball Club",
    short_name: "Coritiba FC",
    nickname: "Coxa",
    stadium_name: "Estádio Major Antônio Couto Pereira (Couto Pereira)",
    city: "Curitiba",
    state: "Paraná",
    country: "Brasil",
    founded_year: 1909,
    follower_count: "~1.5M+ social followers across platforms",
    typical_attendance: "15,000–30,000 per match at Couto Pereira",
    market_context: "Broadcast nationally via Globo/SporTV/Paramount+, regional Paraná TV. Key competitions: Brasileirão Série A/B, Copa do Brasil, Campeonato Paranaense. Fan identity: \"Coxa-Branca\" supporters — loyal, family-oriented, multi-generational fan base.",
    rival_clubs: [
      "Athletico Paranaense (CAP / Furacão) — DIRECT Curitiba rival",
      "Corinthians — São Paulo club",
      "São Paulo FC — São Paulo club",
      "Flamengo — Rio club",
      "Palmeiras — São Paulo club",
      "Grêmio — Porto Alegre club",
      "Internacional — Porto Alegre club",
    ],
    brand_rules: [
      "Crest rule: 1985 star MUST appear above the crest; red is FORBIDDEN in crest usage",
    ],
    inventory_highlights: [
      "JERSEY (Manual de Aplicação Patrocinadores 2026): front chest sponsor max 25cm wide, front chest secondary max 8cm, sleeves max 8cm each, back sponsor max 25cm, shorts max 8cm, socks max 6cm",
      "STADIUM: LED perimeter boards, gigantron scoreboard, naming/section rights, VIP hospitality, concourse branding, tunnel/exit branding, press backdrop",
      "DIGITAL & MEDIA: website banner, app push/banners, Instagram/YouTube/TikTok/X sponsored content, matchday WhatsApp broadcast, co-branded broadcast segments, podcast integration",
      "COMMUNITY: youth academy co-branding, women's team, Curitiba fan festivals, club magazine/programs, training kit co-branding",
    ],
  },
  branding: {
    primary_color: "Verde Coxa #005742 (official Brand Guide 2026 — exact HEX, never approximate)",
    secondary_color: "Branco #FFFFFF",
    typography: "Switzer (primary display), Inter (body/UI fallback) — official Brand Guide 2026",
  },
};

/** @deprecated Transitional shim — prefer buildClubContext(tenant) with the
 *  requesting user's real tenant. Kept so existing call sites that haven't
 *  been migrated yet keep producing identical output to before migration 0047. */
export const CORITIBA_CONTEXT = buildClubContext(CORITIBA_CLUB_CONTEXT_INPUT);

// ---------------------------------------------------------------------------
// Strategy inspiration — used as secondary conditioning (internal reference only)
// ---------------------------------------------------------------------------
const STRATEGY_INSPIRATION = `
SPONSORSHIP STRATEGY ARCHETYPES (use as creative frameworks for Coritiba proposals):
1. AWARENESS: maximum Coritiba jersey/stadium logo visibility, Couto Pereira naming, broadcast exposure
2. FAN ENGAGEMENT: interactive Coritiba fan activations, digital challenges, Couto Pereira matchday experiences
3. COMMUNITY ACTIVATION: CSR-led at Coritiba youth academy, grassroots Curitiba programs, social impact co-branding
4. PREMIUM PARTNERSHIP: Coritiba co-branding exclusivity, VIP Couto Pereira hospitality, limited editions
5. DIGITAL/SOCIAL MEDIA: Coritiba content creation, influencer tie-ins with club, real-time campaigns
6. PRODUCT-LED: sampling at Couto Pereira, product placement in Coritiba ecosystem, performance tie-in
7. LOYALTY STRATEGY: Coritiba member/fan club benefits, exclusive offers, CRM integration with fanbase
8. STADIUM ACTIVATION: Couto Pereira LED boards, concourse branding, matchday Coritiba takeovers

GLOBAL BENCHMARK EXAMPLES (for strategic inspiration only — NOT alternative clubs):
- Red Bull: extreme-sport lifestyle integration; turned sponsorship into content engine
- Nike "Write the Future": emotional storytelling, local heroes
- Heineken UEFA CL: "Man of the Match" shared moments, digital activation
- Guaraná Antarctica: fan culture, regional pride, humor, digital micro-campaigns
- Brahma (Brazilian football): supporter identity brand anchoring
- Banco Itaú: community investment narrative, "Transformar" values
- Magazine Luiza / Magalu: digital fan engagement, real-time social activation
`;

// ---------------------------------------------------------------------------
// Campaign ideas
// ---------------------------------------------------------------------------
export function campaignIdeasPrompt(args: {
  company: CompanyContext;
  objective?: string;
  maxIdeas?: number;
  /** Phase 4 — defaults to Coritiba for existing call sites; pass the
   *  requesting user's real tenant to de-hardcode. */
  tenant?: ClubContextInput;
}) {
  const max = args.maxIdeas ?? 3;
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const nickname = tenant.club_facts.nickname ?? tenant.club_facts.short_name ?? club;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  const region = tenant.club_facts.city ?? "its home market";
  return {
    system: [
      `You are a senior sponsorship strategist for ${club}.`,
      `You generate creative, commercial sponsorship campaign ideas EXCLUSIVELY for ${club} partnerships.`,
      `ALL ideas MUST be centered on ${club}, ${stadium}, and the ${region} market.`,
      tenant.club_facts.rival_clubs?.length
        ? `NEVER suggest ${tenant.club_facts.rival_clubs[0].split(" —")[0]} or any other club as a target — only ${club}.`
        : `NEVER suggest a rival club as a target — only ${club}.`,
      "CRITICAL: Your ENTIRE response must be ONLY a valid JSON object — no markdown, no ```json fences, no explanation text before or after.",
      "Start your response with { and end with }. Nothing else.",
      "",
      buildClubContext(tenant),
      "",
      STRATEGY_INSPIRATION,
    ].join("\n"),
    user: [
      `Potential sponsor company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country/Region: ${args.company.country}` : null,
      args.company.website ? `Website: ${args.company.website}` : null,
      args.company.notes ? `Context: ${args.company.notes}` : null,
      args.objective ? `Objective: ${args.objective}` : null,
      "",
      `Generate ${max} DISTINCT ${club} sponsorship campaign ideas for this company.`,
      `Each idea MUST use a DIFFERENT strategy archetype AND be specific to ${club}'s ecosystem.`,
      `Reference ${stadium}, ${club} fans (${nickname}), and the club's official brand colors, ${region} audience.`,
      "Do NOT mention any competitor club anywhere.",
      "Return JSON:",
      `{
  "ideas": [
    {
      "title": "string (creative campaign name referencing the club/stadium/nickname)",
      "summary": "1-2 sentence concept tied to the club",
      "activation": "concrete activation plan at the stadium with specific club touchpoints",
      "partnership_angle": "why this sponsor + the club makes strategic sense",
      "cta": "call to action for outreach"
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Multi-strategy variants
// ---------------------------------------------------------------------------
export function strategyVariantsPrompt(args: {
  company: CompanyContext;
  campaign: { title: string; summary?: string | null };
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  return {
    system: [
      `You are a chief marketing strategist for ${club} sponsorship sales.`,
      `Generate multiple distinct strategic approaches for a ${club} sponsorship proposal.`,
      `Each variant MUST reference ${club}, ${stadium}, or the ${club} fan ecosystem.`,
      "NEVER mention any rival club.",
      "Output MUST be valid JSON. No markdown fences.",
      "",
      buildClubContext(tenant),
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Summary: ${args.campaign.summary}` : null,
      "",
      `Generate 3 distinct ${club} sponsorship strategy variants.`,
      "Use different archetypes (e.g. stadium/awareness vs. fan engagement vs. community).",
      `All variants must name ${club}, ${stadium}, or the club's official brand colors explicitly.`,
      "Return JSON:",
      `{
  "variants": [
    {
      "id": "awareness|fan_engagement|community|premium|digital|product_led|loyalty|stadium",
      "label": "Strategy name (2-4 words, club-themed)",
      "tagline": "One powerful line referencing the club/nickname",
      "description": "3-4 sentences describing this strategic direction for the club",
      "key_activations": ["stadium activation 1", "fan activation 2", "activation 3"],
      "audience_fit": "Which fan/audience segment this resonates with most",
      "estimated_reach": "Approximate reach/exposure estimate",
      "differentiator": "What makes this strategy unique for this sponsor at the club"
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Proposal (v4 — rich quality, Coritiba grounded)
// ---------------------------------------------------------------------------
export function proposalPrompt(args: {
  company: CompanyContext;
  campaign: {
    title: string;
    summary?: string | null;
    activation?: string | null;
    cta?: string | null;
  };
  strategy_variant?: string | null;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const strategyNote = args.strategy_variant
    ? `\nFocus this proposal on the "${args.strategy_variant}" strategic direction.`
    : "";
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const nickname = tenant.club_facts.nickname ?? tenant.club_facts.short_name ?? club;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  const region = tenant.club_facts.city ?? "its home market";
  const followers = tenant.club_facts.follower_count ?? "its social following";
  const attendance = tenant.club_facts.typical_attendance ?? "its typical matchday attendance";
  const rivalsList = tenant.club_facts.rival_clubs?.map((r) => r.split(" —")[0]).join(", ") ?? "rival clubs";
  return {
    system: [
      `You are a senior B2B sponsorship proposal writer at ${club}, ${region}'s club.`,
      "Your proposals are used in real sales meetings with real brands. They must read as premium, data-grounded, and compelling.",
      "RULES (non-negotiable):",
      `1. ALL sections MUST reference ${club}, ${stadium}, or the club's fan ecosystem.`,
      `2. NEVER mention competitor clubs (${rivalsList}).`,
      "3. Write like a seasoned partnership director — specific, benefit-led, no filler phrases ('synergy', 'leverage', 'stakeholders').",
      `4. Ground every claim: reference ${stadium}'s capacity (${attendance}), ${club}'s digital reach (${followers}), the ${region} market.`,
      `5. Each deliverable must be a concrete, measurable ${club} asset (e.g. 'Jersey chest badge — 25 home & away matches', '${stadium} LED perimeter — 3 minutes/match').`,
      `6. The activation_plan must have clear PHASES (Month 1-2 launch, Month 3-6 ramp, Month 7-12 peak activation) with specific ${club} milestones.`,
      `7. executive_summary must open with the sponsor company's business goal FIRST, then connect it to ${club}'s audience.`,
      "8. Output MUST be valid JSON only. No markdown fences. No extra keys.",
      `9. The 'deliverables' array MUST contain EXACTLY 5 specific items. Never return an empty array. Each item = one concrete ${club} asset with quantity.`,
      "10. CLAIM GROUNDING (non-negotiable — this is real sales collateral shown to a real company): every specific factual claim you make ABOUT THE SPONSOR (their stated goals, a named campaign, headcount, revenue, recent activity, competitors, decision-makers) must come from a 'COMPANY INTELLIGENCE' block if one is provided in the user message. If no such block is provided, or it doesn't cover a topic, do NOT invent a specific fact to fill the gap — write that part in general, industry-appropriate terms instead (e.g. 'brands in the [industry] sector typically pursue...' rather than inventing this specific company's goal). A qualified, general statement is correct; a confident, specific, unsourced one is a fabrication and is not acceptable even if it sounds plausible.",
      "",
      buildClubContext(tenant),
      "",
      STRATEGY_INSPIRATION,
    ].join("\n"),
    user: [
      `Sponsor company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country: ${args.company.country}` : null,
      args.company.notes ? `Context about this company: ${args.company.notes}` : null,
      "",
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Campaign concept: ${args.campaign.summary}` : null,
      args.campaign.activation ? `Activation approach: ${args.campaign.activation}` : null,
      strategyNote,
      "",
      `Write a FULL, high-quality ${club} sponsorship proposal for this company.`,
      "Be SPECIFIC to this company's industry and market context.",
      `Mention ${stadium}, ${club}'s brand identity, ${nickname} fans — make it feel tailored, not generic.`,
      "Return JSON ONLY (no markdown):",
      `{
  "title": "Proposal title — must name the company AND reference the club (e.g. '[Company] × ${club} — [Theme]')",
  "executive_summary": "120–150 words. Start with [Company]'s business goal. Show how the club's reach and matchday fans directly address that goal. End with a bold partnership vision.",
  "campaign_rationale": "150–180 words. Data-grounded case: the club's market, fan demographics, the sponsor's target customer overlap. Reference 2–3 specific club inventory items that match the sponsor's marketing objectives.",
  "sponsorship_value": "120–150 words. Concrete ROI framing: brand impressions at the stadium per season, digital reach numbers, co-branded content opportunities, community activation value. Be specific — mention real club assets.",
  "activation_plan": "200–250 words. THREE clear phases:\\nPhase 1 (M1–M2): Launch activation — jersey reveal, social announcement, matchday intro event at the stadium.\\nPhase 2 (M3–M6): Ramp — LED perimeter, PA announcements, co-branded digital content, fan activation zone.\\nPhase 3 (M7–M12): Peak — title sponsorship moment, stadium naming activation, cross-promotion with club milestones.",
  "deliverables": [
    "Deliverable 1 — specific asset + quantity (e.g. 'Jersey chest badge — 25 home + away matches per season')",
    "Deliverable 2 — specific stadium asset",
    "Deliverable 3 — digital/social asset",
    "Deliverable 4 — matchday activation asset",
    "Deliverable 5 — community/co-brand asset"
  ],
  "investment_note": "2–3 sentences. Frame the investment relative to reach: cost-per-impression at the stadium vs. traditional media. Aspirational — no specific currency amount. Position as a strategic partnership, not a transaction.",
  "cta": "One powerful, specific call to action — name the next step (e.g. 'Let\\'s schedule a 30-minute partnership briefing this week.')"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Barter deal-term structuring (Phase 2 piece 3 — master_report.md 7.2,
// extending Pattern 1's claim-grounding into the barter proposal type
// specifically). Appended to proposalPrompt()'s user message when
// proposal_type is "barter" — the base prompt/Rule 10 already forbid
// inventing facts about the SPONSOR; this additionally forbids inventing
// specific exchange items Coritiba doesn't actually have an open need for.
// ---------------------------------------------------------------------------
export interface BarterGroundingItem {
  item_name: string;
  category: string;
  quantity: string | null;
  target_price: number | null;
  currency: string | null;
}

// Contract split templates (master_report.md Section 4 item 6) — preset
// cash/exchange ratios the user can pick in the wizard instead of leaving
// the split entirely up to the AI. "custom_ai" means no template was picked
// and the AI proposes its own split as before.
export const BARTER_SPLIT_TEMPLATES = {
  full_barter: { cash_pct: 0, exchange_pct: 100, label: "100% Permuta" },
  "25_75": { cash_pct: 25, exchange_pct: 75, label: "25% Caixa / 75% Permuta" },
  "50_50": { cash_pct: 50, exchange_pct: 50, label: "50% Caixa / 50% Permuta" },
  "75_25": { cash_pct: 75, exchange_pct: 25, label: "75% Caixa / 25% Permuta" },
} as const;
export type BarterSplitTemplateKey = keyof typeof BARTER_SPLIT_TEMPLATES;

export function barterTermsInstructionBlock(
  openItems: BarterGroundingItem[],
  forcedSplit?: { cash_pct: number; exchange_pct: number; label: string },
  /** Phase 4 — defaults to "Coritiba FC" for existing call sites. */
  clubName = "Coritiba FC",
): string {
  const itemsBlock = openItems.length
    ? openItems
        .map(
          (i) =>
            `- ${i.item_name} (${i.category})${i.quantity ? `, qty: ${i.quantity}` : ""}${
              i.target_price ? `, target value: ${i.currency ?? "BRL"} ${i.target_price.toLocaleString("pt-BR")}` : ""
            }`,
        )
        .join("\n")
    : null;

  return [
    "",
    "BARTER DEAL-TERM STRUCTURING (this is a barter/permuta proposal):",
    itemsBlock
      ? `${clubName} currently has these OPEN barter needs — only propose exchanging items from this real list if the sponsor's industry plausibly supplies them:\n${itemsBlock}`
      : `${clubName} has no specific open barter needs on file right now — do NOT invent specific items to request. Propose a general cash + in-kind structure instead (e.g. a percentage of the sponsorship value offset by goods/services broadly typical of the sponsor's industry, described qualitatively, not as fabricated specific SKUs).`,
    forcedSplit
      ? `The commercial team has already selected a contract split template: ${forcedSplit.label}. You MUST use cash_portion_pct: ${forcedSplit.cash_pct} and exchange_portion_pct: ${forcedSplit.exchange_pct} exactly — do not propose a different split.`
      : "No contract split template was selected — propose whatever cash_portion_pct/exchange_portion_pct split best fits this sponsor.",
    "In addition to the standard proposal JSON fields, include this extra key:",
    `"barter_terms": {
  "exchange_items": [
    { "item_name": "must match an item from the OPEN barter needs list above if one was provided and relevant; otherwise a general category, not a fabricated specific product", "estimated_value_brl": <number or null>, "notes": "why this fits the sponsor" }
  ],
  "cash_portion_pct": <0-100, the share of sponsorship value paid in cash>,
  "exchange_portion_pct": <0-100, must sum to 100 with cash_portion_pct>,
  "structure_notes": "2-3 sentences explaining the proposed split rationale"
}`,
    `Per Rule 10, only claim a specific item is something ${clubName} needs if it appears in the OPEN barter needs list above — otherwise keep exchange_items general.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// NIL / creator-deal structuring (Phase 7 — master_report.md Section 4 item
// 13, 8th proposal type). Appended to proposalPrompt()'s user message when
// proposal_type is "nil_creator" — the sponsee here is an individual athlete,
// content creator or influencer rather than a company, so the base prompt's
// "COMPANY INTELLIGENCE" framing doesn't apply. Same claim-grounding
// discipline as barterTermsInstructionBlock(): the only real facts about the
// creator are whatever is in their record's notes field — never invent
// follower counts, engagement rates, past brand deals, or audience
// demographics that weren't actually provided.
// ---------------------------------------------------------------------------
export function nilTermsInstructionBlock(
  creatorNotes?: string | null,
  /** Phase 4 — defaults to "Coritiba FC" for existing call sites. */
  clubName = "Coritiba FC",
): string {
  const hasNotes = !!creatorNotes?.trim();

  return [
    "",
    "NIL / CREATOR-DEAL STRUCTURING (this proposal is for an individual athlete, creator, or influencer, not a company):",
    hasNotes
      ? `Known real facts about this individual (from their record notes) — only use these, do not add more: ${creatorNotes}`
      : "No real facts (follower counts, engagement rates, past brand deals, audience demographics) are on file for this individual — do NOT invent any. Describe the proposed terms qualitatively without fabricated numbers or claimed history.",
    `${clubName} is always the rights-holder/club side of this deal, engaging the individual for image rights, content collaboration, or appearances — frame it that way, not as the individual sponsoring the club.`,
    "In addition to the standard proposal JSON fields, include this extra key:",
    `"nil_terms": {
  "deal_type": "one of: image_rights | content_collaboration | appearance | ambassador | hybrid",
  "deliverables": ["what the individual provides — only reference platforms/formats/facts confirmed above if any were given, otherwise keep general"],
  "club_provides": ["what ${clubName} provides in return — access, platform, compensation structure described qualitatively"],
  "structure_notes": "2-3 sentences explaining the proposed deal rationale"
}`,
    "Per Rule 10, only state a specific fact about this individual (audience size, platform, prior deals) if it appears in the notes above — otherwise keep every deliverable and rationale general.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Grant/ESG proposal variant (Phase 9 — master_report.md §6.1: "the
// existing 'Aliança Estratégica' deck engine gets a template variant per
// niche... Grant/ESG for nonprofits"). Appended when proposal_type is
// "grant_esg" — the rights-holder here is soliciting cause-marketing/CSR
// funding rather than selling stadium/match-day brand exposure, so the
// base proposalPrompt()'s stadium/fan-reach framing is explicitly
// overridden rather than extended. Same claim-grounding discipline as
// every other instruction block: never invent beneficiary counts, impact
// metrics, or program details that aren't in the organization's real notes.
// ---------------------------------------------------------------------------
export function grantEsgInstructionBlock(
  orgNotes?: string | null,
  clubName = "Coritiba FC",
): string {
  const hasNotes = !!orgNotes?.trim();

  return [
    "",
    "GRANT/ESG PARTNERSHIP FRAMING (override the base framing above — this is NOT a stadium/match-day sponsorship pitch):",
    `${clubName} is soliciting cause-marketing / CSR / grant funding from this company, not selling brand exposure to matchday fans. Do not lead with stadium capacity, attendance figures, or in-stadium placements.`,
    "Reframe every section around: the social program or cause this funding supports, measurable community impact, and the alignment between the funder's own CSR/ESG goals and this program — not media reach.",
    hasNotes
      ? `Known real facts about the program/beneficiaries (from the organization's notes) — only use these, do not add more: ${orgNotes}`
      : "No real facts about specific beneficiary counts, program history, or measured outcomes are on file — do NOT invent any. Describe the program's structure and intent qualitatively rather than with fabricated statistics.",
    "In addition to the standard proposal JSON fields, include this extra key:",
    `"grant_esg_terms": {
  "program_focus": "one short phrase naming the social cause/program area (only from real notes above if given, otherwise keep general, e.g. 'youth community development')",
  "impact_metrics": ["how impact will be reported back to the funder — reporting cadence and qualitative method, not invented numbers"],
  "use_of_funds": "1-2 sentences on how the contribution would be used",
  "esg_alignment_note": "1-2 sentences connecting this to the funder's own likely CSR/ESG reporting needs, phrased generally, not assuming specifics about the funder's ESG program unless it's in real company data"
}`,
    "Per Rule 10, only cite a specific beneficiary count, past grant amount, or outcome statistic if it appears in the real notes above — otherwise stay qualitative.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Exhibitor Package proposal variant (Phase 9 — master_report.md §6.1:
// "...Exhibitor Package for conferences"). Appended when proposal_type is
// "exhibitor_package" — the rights-holder here is a conference/trade-show
// organizer selling booth space and attendee access, not a sports club
// selling matchday exposure. Same override-not-extend approach as the
// Grant/ESG block above.
// ---------------------------------------------------------------------------
export function exhibitorPackageInstructionBlock(
  eventNotes?: string | null,
  clubName = "Coritiba FC",
): string {
  const hasNotes = !!eventNotes?.trim();

  return [
    "",
    "EXHIBITOR PACKAGE FRAMING (override the base framing above — this is NOT a stadium/match-day sponsorship pitch):",
    `${clubName} is selling an exhibitor/sponsor package for a conference or trade-show event, not stadium or match-day exposure. Do not reference stadium capacity, attendance at matches, or in-stadium placements.`,
    "Reframe every section around real conference-exhibitor deliverables: booth space and location tier, session/speaking-slot access, attendee list or lead-retrieval access, badge-scan data, and on-site signage at the event venue.",
    hasNotes
      ? `Known real facts about this event (from the organization's notes) — only use these, do not add more: ${eventNotes}`
      : "No real facts about expected attendee count, past event attendance, or exhibitor history are on file — do NOT invent any. Describe booth tier and access qualitatively rather than with fabricated attendance numbers.",
    "In addition to the standard proposal JSON fields, include this extra key:",
    `"exhibitor_terms": {
  "booth_tier": "one of: standard | premium | headline",
  "deliverables": ["booth space, speaking slots, badge-scan/lead access, signage — only reference specifics confirmed in real notes above, otherwise describe generally"],
  "attendee_access_note": "1-2 sentences on what audience/attendee access is included, phrased qualitatively unless real attendance figures were provided",
  "structure_notes": "2-3 sentences on the proposed exhibitor relationship rationale"
}`,
    "Per Rule 10, only state a specific attendance figure, exhibitor count, or past-event statistic if it appears in the real notes above — otherwise keep every deliverable general.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------
export function pricingTiersPrompt(args: {
  company: CompanyContext;
  campaign: { title: string; summary?: string | null };
  currency?: string;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const currency = args.currency ?? "BRL";
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const nickname = tenant.club_facts.nickname ?? tenant.club_facts.short_name ?? club;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  return {
    system: [
      `You are a sponsorship sales director at ${club}.`,
      `Create realistic pricing packages for a ${club} / ${stadium} sponsorship.`,
      `Prices should reflect ${tenant.club_facts.market_context ?? "the club's competitive positioning in its market"}.`,
      `Reference ${stadium} inventory, ${club} digital assets, and the club's official branding.`,
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Sponsor company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Summary: ${args.campaign.summary}` : null,
      `Currency: ${currency}`,
      "",
      `Generate 3 ${club} sponsorship pricing tiers (low/mid/high). Mid tier = highlighted/recommended.`,
      `Each tier references specific ${stadium} inventory (LED boards, jersey, PA, digital, etc.).`,
      "Return JSON:",
      `{
  "tiers": [
    {
      "tier": "low",
      "label": "Parceiro ${nickname}",
      "price_range": "R$ X.000 – R$ Y.000/mês",
      "activations": ["stadium activation 1", "digital activation 2"],
      "deliverables": ["deliverable 1", "deliverable 2"],
      "visibility": "Where/how brand appears in the club's ecosystem",
      "digital_exposure": "Club social/digital media exposure",
      "stadium_exposure": "Stadium exposure details",
      "highlight": false
    },
    {
      "tier": "mid",
      "label": "Patrocinador Master ${nickname}",
      "price_range": "R$ X.000 – R$ Y.000/mês",
      "activations": ["activation 1", "activation 2", "activation 3"],
      "deliverables": ["deliverable 1", "deliverable 2", "deliverable 3"],
      "visibility": "...",
      "digital_exposure": "...",
      "stadium_exposure": "...",
      "highlight": true
    },
    {
      "tier": "high",
      "label": "Patrocinador Diamante ${nickname}",
      "price_range": "R$ X.000 – R$ Y.000/mês",
      "activations": ["activation 1", "activation 2", "activation 3", "activation 4"],
      "deliverables": ["deliverable 1", "deliverable 2", "deliverable 3", "deliverable 4"],
      "visibility": "...",
      "digital_exposure": "...",
      "stadium_exposure": "...",
      "highlight": false
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Visual prompts
// ---------------------------------------------------------------------------
export function visualPromptsPrompt(args: {
  company: CompanyContext;
  campaign: { title: string; summary?: string | null };
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  const colors = [tenant.branding.primary_color, tenant.branding.secondary_color].filter(Boolean).join(" and ") || "the club's brand colors";
  return {
    system: [
      `You generate detailed image-generation prompts for ${club} sponsorship mockups.`,
      `All visuals MUST reference ${club}'s colors (${colors}), ${stadium}, or ${club} branding.`,
      "NEVER reference a rival club's colors or branding.",
      "Prompts should be suitable for AI image generators (DALL-E, Midjourney, Stable Diffusion).",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Sponsor company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Concept: ${args.campaign.summary}` : null,
      "",
      `Generate 5 ${club} visual mockup prompts.`,
      `Include: ${club} jersey/kit with sponsor logo, ${stadium} LED board, ${club} social media visual, stadium banner, fan zone activation.`,
      `All prompts must specify the club's official colors (${colors}) and ${stadium} or fan context.`,
      "Return JSON:",
      `{
  "visuals": [
    {
      "id": "jersey_front",
      "label": "${club} Jersey Brand Placement",
      "type": "jersey",
      "prompt": "Detailed prompt: ${club} jersey in its official colors, authentic club crest unchanged on wearer's left chest, sponsor logo only on wearer's right chest opposite crest, photorealistic, professional sports photography, stadium background...",
      "style_notes": "Photorealistic, official club color theme",
      "aspect_ratio": "1:1",
      "placeholder_description": "Sponsor logo on club jersey front"
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Company intelligence
// ---------------------------------------------------------------------------
export function companyIntelligencePrompt(args: {
  company: CompanyContext;
  objective?: string;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const stadium = tenant.club_facts.stadium_name ?? `${club}'s stadium`;
  const region = tenant.club_facts.city ?? "its home market";
  const rivalsList = tenant.club_facts.rival_clubs?.map((r) => r.split(" —")[0]).join(", ") ?? "";
  return {
    system: [
      `You are a business intelligence analyst specialising in ${club} sponsorship fit analysis.`,
      `Analyse the company's fit as a ${club} sponsor in the ${region} market.`,
      `All analysis, recommendations, and context must be framed around ${club} partnership.`,
      `NEVER suggest competitor clubs. The partnership target is always ${club}.`,
      rivalsList
        ? `CRITICAL: Do NOT mention ${rivalsList}, or any other football club by name anywhere in your response. Only ${club}.`
        : `CRITICAL: Do NOT mention any other football club by name anywhere in your response. Only ${club}.`,
      "When giving global inspiration examples, reference non-football or international sponsorships only (e.g., NBA, NFL, F1, tennis, technology companies, retail brands) — never other local clubs.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.website ? `Website: ${args.company.website}` : null,
      args.company.country ? `Country/Region: ${args.company.country}` : null,
      args.company.notes ? `Additional context: ${args.company.notes}` : null,
      args.objective ? `Sponsorship objective: ${args.objective}` : null,
      "",
      `Analyse this company's fit as a ${club} / ${stadium} sponsor. Return JSON:`,
      `{
  "intelligence": {
    "products_services": "Brief description of main products/services",
    "target_audience": "Primary customer segments and demographics",
    "marketing_goals": ["goal 1 aligned with the club's audience", "goal 2", "goal 3"],
    "brand_positioning": "How this brand aligns with the club's identity",
    "audience_alignment": "How the company's customers match the club's fan base",
    "loyalty_strategy": "How this partnership strengthens customer loyalty",
    "sponsorship_fit_score": 7.5,
    "sponsorship_fit_rationale": "Why this company is a strong/weak sponsor for the club",
    "recommended_direction": "Recommended sponsorship strategy for this company",
    "local_context": "Specific regional context for this company + the club",
    "global_inspiration": "Non-football brand sponsorship examples (international only, no local clubs) that inspire this partnership"
  }
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// White-space / opportunity-gap finder (Phase 6 — master_report.md Section 4
// P1 item, uses the company-intelligence pipeline already built). Same
// claim-grounding discipline as Rule 10 in proposalPrompt(): only states
// this company's ACTUAL sponsorship activity if real sponsorship_history
// text exists (from the real intelligence/scrape or discover pipelines);
// otherwise says so explicitly rather than inventing a sponsorship history.
// ---------------------------------------------------------------------------
export function opportunityGapPrompt(args: {
  company: CompanyContext;
  sponsorshipHistory?: string | null;
  competitors?: Array<{ name: string; sponsorshipHistory?: string | null }>;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const hasOwnHistory = !!args.sponsorshipHistory?.trim();
  const competitorsWithHistory = (args.competitors ?? []).filter((c) => c.sponsorshipHistory?.trim());
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const rivalsList = tenant.club_facts.rival_clubs?.map((r) => r.split(" —")[0]).join(", ") ?? "";

  const historyBlock = hasOwnHistory
    ? `${args.company.company_name}'s known current sponsorship activity (from real research): ${args.sponsorshipHistory}`
    : `${args.company.company_name}'s current sponsorship activity is NOT known from any real source — do not invent one.`;

  const competitorBlock = competitorsWithHistory.length
    ? `Known real competitor sponsorship activity:\n${competitorsWithHistory.map((c) => `- ${c.name}: ${c.sponsorshipHistory}`).join("\n")}`
    : "No real competitor sponsorship data is available — do not invent competitor sponsorships either.";

  return {
    system: [
      `You are a sponsorship-strategy analyst identifying white-space opportunities for ${club}.`,
      `Goal: given what is REALLY known about a prospect's current sponsorship activity (and, if available, their competitors'), identify a genuine gap — a category or channel where they have little/no sponsorship presence — that a ${club} partnership could credibly fill.`,
      "CLAIM GROUNDING (non-negotiable, same as claim-grounding used elsewhere in this platform): only state that this company or a named competitor sponsors/doesn't sponsor something specific if that fact was given to you below. If no sponsorship history is known for this company, say so explicitly (e.g. 'no public sponsorship activity found') and frame the opportunity in general, industry-appropriate terms instead — do not fabricate a specific gap as if it were verified.",
      rivalsList
        ? `Never mention competitor football clubs (${rivalsList}) — the partnership target is always ${club}.`
        : `Never mention competitor football clubs — the partnership target is always ${club}.`,
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      "",
      historyBlock,
      competitorBlock,
      "",
      "Return JSON:",
      `{
  "grounded": ${hasOwnHistory || competitorsWithHistory.length ? "true" : "false"},
  "current_sponsorship_summary": "1 sentence — what is really known about their current sponsorship posture, or 'No public sponsorship activity found' if nothing is known",
  "gap_summary": "1-2 sentences — the specific white-space opportunity, grounded in the facts above if any exist, otherwise a general industry-pattern statement",
  "opportunity_angle": "The specific pitch angle ${club}'s commercial team should use, referencing the gap"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Outreach email
// ---------------------------------------------------------------------------
export function outreachEmailPrompt(args: {
  company: CompanyContext;
  proposalTitle: string;
  proposalSummary: string;
  contactName?: string | null;
  contactTitle?: string | null;
  proposalLink?: string | null;
  senderName?: string | null;
  senderTitle?: string | null;
  tone?: EmailTone;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const senderBlock = args.senderName
    ? `Sender: ${args.senderName}${args.senderTitle ? `, ${args.senderTitle}` : ""} — Departamento Comercial, ${club}`
    : `Sender: Departamento Comercial, ${club}`;

  return {
    system: [
      `You write concise, compelling B2B sponsorship pitch emails in Brazilian Portuguese for ${club}.`,
      `Emails represent ${club}'s commercial department.`,
      args.tone ? TONE_INSTRUCTIONS[args.tone] : "Tone: warm, confident, direct, exciting — make the sponsor feel the opportunity is unique.",
      "Keep under 200 words. No fluff. Include a clear CTA.",
      "ALWAYS include the proposal link in the email body as a prominent CTA button/line.",
      "NEVER use [Nome] or [placeholder] — use the actual names provided.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.contactName ? `Contact name: ${args.contactName}` : null,
      args.contactTitle ? `Contact title: ${args.contactTitle}` : null,
      `Proposal title: ${args.proposalTitle}`,
      `Proposal summary: ${args.proposalSummary}`,
      args.proposalLink ? `Proposal link (MUST appear in body): ${args.proposalLink}` : null,
      senderBlock,
      "",
      `Write a compelling ${club} sponsorship pitch email in Portuguese (Brazilian). Return JSON:`,
      `{
  "subject": "subject line — mention the club and the opportunity",
  "body_text": "plain text body — include CTA with proposal link",
  "body_html": "HTML version with <p> tags, include a prominent 'Ver Proposta →' link"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Follow-up email
// ---------------------------------------------------------------------------
export function followupEmailPrompt(args: {
  company: CompanyContext;
  previousSubject: string;
  previousBody: string;
  daysSinceSent: number;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const club = (args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT).club_facts.club_name;
  return {
    system: [
      `You draft polite, low-pressure follow-up emails for ${club} sponsorship outreach.`,
      `Emails represent ${club}'s commercial department.`,
      "Keep under 120 words. Reference the prior message lightly.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      `Original subject: ${args.previousSubject}`,
      `Days since last contact: ${args.daysSinceSent}`,
      "",
      "Original message (for tone reference):",
      args.previousBody,
      "",
      "Return JSON:",
      `{
  "subject": "follow-up subject (reuse or prefix with Re:)",
  "body_text": "plain text body",
  "body_html": "<p>...</p> body"
}`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Negotiation email — flexes scope/price/terms to move toward closing
// ---------------------------------------------------------------------------
export function negotiationEmailPrompt(args: {
  company: CompanyContext;
  proposalTitle: string;
  proposalSummary: string;
  contactName?: string | null;
  proposalLink?: string | null;
  senderName?: string | null;
  senderTitle?: string | null;
  tone?: EmailTone;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const club = (args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT).club_facts.club_name;
  const senderBlock = args.senderName
    ? `Sender: ${args.senderName}${args.senderTitle ? `, ${args.senderTitle}` : ""} — Departamento Comercial, ${club}`
    : `Sender: Departamento Comercial, ${club}`;
  return {
    system: [
      `You write persuasive B2B negotiation emails in Brazilian Portuguese for ${club}'s commercial department.`,
      "Goal: move a warm prospect toward closing by offering flexibility on scope, price, term length or added counterparts.",
      args.tone ? TONE_INSTRUCTIONS[args.tone] : "Tone: collaborative, confident, solution-oriented — never desperate, never discount for its own sake.",
      "Propose concrete next steps (e.g. a 15-minute call) and reference the proposal link.",
      "Keep under 180 words. Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.contactName ? `Contact name: ${args.contactName}` : null,
      `Proposal title: ${args.proposalTitle}`,
      `Proposal summary: ${args.proposalSummary}`,
      args.proposalLink ? `Proposal link (MUST appear in body): ${args.proposalLink}` : null,
      senderBlock,
      "",
      "Write a negotiation email that offers to adjust scope/value/terms so the deal fits their budget. Return JSON:",
      `{
  "subject": "subject line — signal flexibility / next step",
  "body_text": "plain text body with CTA + proposal link",
  "body_html": "<p>...</p> body with a 'Ver Proposta →' link"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Barter / permuta email — proposes exchanging goods/services for exposure
// ---------------------------------------------------------------------------
export function barterEmailPrompt(args: {
  company: CompanyContext;
  proposalTitle: string;
  proposalSummary: string;
  contactName?: string | null;
  proposalLink?: string | null;
  senderName?: string | null;
  senderTitle?: string | null;
  tone?: EmailTone;
  /** Phase 4 — defaults to Coritiba for existing call sites. */
  tenant?: ClubContextInput;
}) {
  const club = (args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT).club_facts.club_name;
  const senderBlock = args.senderName
    ? `Sender: ${args.senderName}${args.senderTitle ? `, ${args.senderTitle}` : ""} — Departamento Comercial, ${club}`
    : `Sender: Departamento Comercial, ${club}`;
  return {
    system: [
      `You write B2B barter (permuta) proposal emails in Brazilian Portuguese for ${club}'s commercial department.`,
      `Goal: propose a permuta where part of the sponsorship investment is paid with the prospect's own products/services, reducing their cash outlay while still delivering brand exposure via ${club}'s sponsorship inventory.`,
      args.tone ? TONE_INSTRUCTIONS[args.tone] : "Tone: creative, win-win, practical. Make the exchange feel low-risk and high-value.",
      "Reference the proposal link and suggest a quick call to define the exchange mix.",
      "Keep under 180 words. Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry (their goods/services): ${args.company.industry}` : null,
      args.contactName ? `Contact name: ${args.contactName}` : null,
      `Proposal title: ${args.proposalTitle}`,
      `Proposal summary: ${args.proposalSummary}`,
      args.proposalLink ? `Proposal link (MUST appear in body): ${args.proposalLink}` : null,
      senderBlock,
      "",
      "Write a barter/permuta email proposing to exchange their goods/services for sponsorship exposure. Return JSON:",
      `{
  "subject": "subject line — mention permuta / barter opportunity",
  "body_text": "plain text body with CTA + proposal link",
  "body_html": "<p>...</p> body with a 'Ver Proposta →' link"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

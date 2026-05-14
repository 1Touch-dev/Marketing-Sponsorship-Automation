/**
 * Centralised prompt templates — v2.0.0
 *
 * PROMPT_VERSION is bumped whenever a prompt changes so that
 * campaigns / proposals / emails can record which prompt generated them.
 *
 * v2.0.0 adds:
 *  - Multi-strategy variant generation (awareness, engagement, community, etc.)
 *  - Low / Mid / High pricing tier generation
 *  - AI visual prompt generation (jersey, banner, LED boards)
 *  - Company intelligence analysis
 *  - Brazilian + global campaign inspiration conditioning
 */

export const PROMPT_VERSION = "v2.0.0" as const;

export interface CompanyContext {
  company_name: string;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Strategy inspiration library — used as conditioning context
// ---------------------------------------------------------------------------
const STRATEGY_INSPIRATION = `
GLOBAL SPONSORSHIP INSPIRATION EXAMPLES:
- Red Bull: extreme-sport lifestyle integration; turned sponsorship into content engine
- Nike "Write the Future" (FIFA): emotional storytelling with global athletes, local heroes
- Heineken UEFA CL: "Man of the Match" shared moments, bar culture, digital activation
- Mastercard "Priceless" series: experiential activations, priceless moments in stadiums
- Coca-Cola FIFA partnership: fan zones, trophies tour, local street activations
- Gatorade: performance science meets athlete stories; product-led sponsorship
- Spotify / Barcelona FC jersey: brand visibility meets streaming culture crossover
- Guaraná Antarctica (Brazilian): fan culture, regional pride, humor, digital micro-campaigns
- Brahma (Brazilian football): supporter identity, "torcer" (to root) brand anchoring
- Banco Itaú (Brazilian): community investment narrative, "Transformar" brand values
- Magazine Luiza / Magalu: digital fan engagement, real-time social activation
- Claro Brazil: connectivity as empowerment narrative in stadiums and communities

CURITIBA / PARANÁ REGIONAL CONTEXT:
- Strong football culture: Athletico Paranaense (CAP), Coritiba FC, Paraná Clube
- Industrial base: automotive (Renault, Volkswagen, Volvo), logistics, agribusiness
- Young, educated consumer base with high digital penetration
- Community-driven activation performs well in Curitiba (vila, bairro culture)
- Sports nutrition and health/wellness industry is growing strongly in the South region
- Local businesses value long-term community partnerships over transactional deals

KEY SPONSORSHIP STRATEGY ARCHETYPES:
1. AWARENESS: maximum logo visibility, stadium naming, broadcast exposure
2. FAN ENGAGEMENT: interactive activations, digital challenges, matchday experiences
3. COMMUNITY ACTIVATION: CSR-led, grassroots, youth programs, social impact
4. PREMIUM PARTNERSHIP: co-branding, exclusivity, VIP access, limited editions
5. DIGITAL/SOCIAL MEDIA: content creation, influencer tie-ins, real-time campaigns
6. PRODUCT-LED: sampling, product placement, on-field branding, performance tie-in
7. LOYALTY STRATEGY: member benefits, exclusive offers, CRM integration
8. STADIUM ACTIVATION: LED boards, concourse branding, matchday takeovers
`;

// ---------------------------------------------------------------------------
// Campaign ideas
// ---------------------------------------------------------------------------
export function campaignIdeasPrompt(args: {
  company: CompanyContext;
  objective?: string;
  maxIdeas?: number;
}) {
  const max = args.maxIdeas ?? 5;
  return {
    system: [
      "You are a senior sponsorship strategist specialised in the Brazilian market, especially Paraná/Curitiba.",
      "You combine deep local knowledge with global campaign innovation to generate creative, high-conversion sponsorship ideas.",
      "Your output MUST be a single valid JSON object. No markdown fences, no commentary outside the JSON.",
      "",
      STRATEGY_INSPIRATION,
    ].join("\n"),
    user: [
      `Target company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country/Region: ${args.company.country}` : null,
      args.company.website ? `Website: ${args.company.website}` : null,
      args.company.notes ? `Notes: ${args.company.notes}` : null,
      args.objective ? `Objective: ${args.objective}` : null,
      "",
      `Generate ${max} DISTINCT sponsorship campaign ideas. Each idea should use a DIFFERENT strategy archetype (awareness, fan engagement, community, premium, digital, product-led, etc).`,
      "Be creative, specific to this company's industry, and draw on both Brazilian market context and global best practices.",
      "Return JSON of shape:",
      `{
  "ideas": [
    {
      "title": "string (creative, memorable campaign name)",
      "summary": "1-2 sentence concept",
      "activation": "concrete activation plan with specific touchpoints",
      "partnership_angle": "why this partnership makes strategic sense for this company",
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
}) {
  return {
    system: [
      "You are a chief marketing strategist specialising in sports sponsorship.",
      "Generate multiple distinct strategic approaches for a sponsorship proposal.",
      "Each variant must have a genuinely different strategic direction and tone.",
      "Output MUST be valid JSON. No markdown fences.",
      "",
      STRATEGY_INSPIRATION,
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Summary: ${args.campaign.summary}` : null,
      "",
      "Generate 3 distinct strategy variants for this sponsorship proposal.",
      "Use different archetypes: e.g. awareness vs. fan engagement vs. community activation.",
      "Return JSON:",
      `{
  "variants": [
    {
      "id": "awareness|fan_engagement|community|premium|digital|product_led|loyalty|stadium",
      "label": "Strategy name (2-4 words)",
      "tagline": "One powerful line",
      "description": "3-4 sentences describing this strategic direction",
      "key_activations": ["activation 1", "activation 2", "activation 3"],
      "audience_fit": "Which audience segment this resonates with most",
      "estimated_reach": "Approximate reach/exposure estimate",
      "differentiator": "What makes this strategy unique for this company"
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Proposal (v2 — enriched)
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
}) {
  const strategyNote = args.strategy_variant
    ? `\nFocus this proposal on the "${args.strategy_variant}" strategic direction.`
    : "";
  return {
    system: [
      "You are a senior B2B sponsorship proposal writer with expertise in Brazilian and international sports marketing.",
      "Write a professional, visually-structured, persuasive sponsorship proposal.",
      "The proposal should read like a premium business document — executive-quality language.",
      "Output MUST be valid JSON. No markdown fences.",
      "",
      STRATEGY_INSPIRATION,
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country: ${args.company.country}` : null,
      args.company.notes ? `Context: ${args.company.notes}` : null,
      "",
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Concept: ${args.campaign.summary}` : null,
      args.campaign.activation ? `Activation approach: ${args.campaign.activation}` : null,
      strategyNote,
      "",
      "Return JSON:",
      `{
  "title": "Proposal title",
  "executive_summary": "~120 words — powerful opening statement",
  "campaign_rationale": "~150 words — why this sponsorship makes business sense for the company",
  "sponsorship_value": "~120 words — concrete value delivered to the sponsor",
  "activation_plan": "~200 words — specific, phased activation plan with milestones",
  "deliverables": ["deliverable 1", "deliverable 2", "deliverable 3", "deliverable 4", "deliverable 5"],
  "investment_note": "High-level investment framing (no specific currency, keep aspirational)",
  "cta": "Single compelling call to action"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------
export function pricingTiersPrompt(args: {
  company: CompanyContext;
  campaign: { title: string; summary?: string | null };
  currency?: string;
}) {
  const currency = args.currency ?? "BRL";
  return {
    system: [
      "You are a sponsorship sales director with expertise in Brazilian sports marketing pricing.",
      "Create realistic, compelling pricing packages for a sponsorship proposal.",
      "Prices should reflect the Brazilian market — specifically Paraná/Curitiba regional sports.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Summary: ${args.campaign.summary}` : null,
      `Currency: ${currency}`,
      "",
      "Generate exactly 3 pricing tiers (low, mid, high). The mid tier should be marked as highlighted/recommended.",
      "Return JSON:",
      `{
  "tiers": [
    {
      "tier": "low",
      "label": "Patrocinador Apoiador",
      "price_range": "R$ X.000 – R$ Y.000/mês",
      "activations": ["activation 1", "activation 2"],
      "deliverables": ["deliverable 1", "deliverable 2"],
      "visibility": "Where and how the brand appears",
      "digital_exposure": "Digital/social media exposure details",
      "stadium_exposure": "Stadium/venue exposure details",
      "highlight": false
    },
    {
      "tier": "mid",
      "label": "Patrocinador Master",
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
      "label": "Patrocinador Diamante",
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
}) {
  return {
    system: [
      "You generate detailed, professional image-generation prompts for sports sponsorship mockups.",
      "Each prompt should be specific to the company's industry and campaign context.",
      "Prompts should be suitable for AI image generators (DALL-E, Midjourney, Stable Diffusion).",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Concept: ${args.campaign.summary}` : null,
      "",
      "Generate 4-5 visual mockup prompts for this sponsorship proposal.",
      "Include: jersey/kit branding, stadium banner/LED board, social media visual, product activation visual.",
      "Return JSON:",
      `{
  "visuals": [
    {
      "id": "jersey_front",
      "label": "Jersey Brand Placement",
      "type": "jersey",
      "prompt": "Detailed image generation prompt (50-100 words, specific colors, style, context)",
      "style_notes": "Visual style notes (e.g. photorealistic, modern, vibrant)",
      "aspect_ratio": "1:1",
      "placeholder_description": "Brief description of what this mockup shows"
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
export function companyIntelligencePrompt(args: { company: CompanyContext; objective?: string }) {
  return {
    system: [
      "You are a business intelligence analyst specialising in brand strategy and sponsorship fit analysis.",
      "Analyse the company and generate actionable intelligence for a sponsorship outreach strategy.",
      "Be specific, data-driven in reasoning, and commercially realistic.",
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
      "Analyse this company for sports sponsorship fit. Return JSON:",
      `{
  "intelligence": {
    "marketing_goals": ["goal 1", "goal 2", "goal 3"],
    "brand_positioning": "How this brand is positioned in its market",
    "audience_alignment": "How the company's customer base aligns with sports audiences",
    "loyalty_strategy": "Likely customer loyalty / retention approach",
    "sponsorship_fit_score": 7.5,
    "sponsorship_fit_rationale": "Why this company is a strong/weak sponsorship candidate",
    "recommended_direction": "Recommended strategic direction for this sponsorship",
    "local_context": "Specific Brazilian/regional context for this company",
    "global_inspiration": "Global campaign examples that could inspire this partnership"
  }
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
}) {
  return {
    system: [
      "You write concise, warm B2B outreach emails for sponsorship deals.",
      "Tone: confident, professional, no fluff. Keep under 180 words.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.contactName ? `Contact: ${args.contactName}` : null,
      `Proposal title: ${args.proposalTitle}`,
      `Proposal summary: ${args.proposalSummary}`,
      "",
      "Return JSON:",
      `{
  "subject": "short subject line",
  "body_text": "plain text body",
  "body_html": "same body, simple HTML (<p>...</p>)"
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
}) {
  return {
    system: [
      "You draft polite, low-pressure follow-up emails for a sponsorship outreach.",
      "Keep under 120 words. Reference the prior message lightly.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      `Original subject: ${args.previousSubject}`,
      `Days since last contact: ${args.daysSinceSent}`,
      "",
      "Original message (for tone, not to be quoted verbatim):",
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

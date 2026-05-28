/**
 * Social & Ads Intelligence Scraper
 * Uses Apify actors to pull:
 *   - LinkedIn company profile via automation-lab/linkedin-company-scraper
 *     (no login, no cookies, ~$0.003/company, works on free tier)
 *   - LinkedIn URL discovered via Google SERP if not already known
 *   - Active Google/Meta ads signals via SERP
 *   - Social media presence (Instagram, Twitter/X, YouTube, Facebook)
 */

import { runActor } from "@/lib/intelligence/apify";
import { searchGoogle } from "@/lib/intelligence/google-search";
import { logger } from "@/lib/monitoring/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkedInProfile = {
  name: string | null;
  description: string | null;
  website: string | null;
  industry: string | null;
  employee_count: string | null;
  headquarters: string | null;
  founded: string | null;
  specialties: string[];
  follower_count: number | null;
  linkedin_url: string | null;
  fetched_at: string;
};

export type AdSignals = {
  has_active_google_ads: boolean;
  has_active_meta_ads: boolean;
  ad_headlines: string[];
  ad_descriptions: string[];
  estimated_ad_spend_signal: "low" | "medium" | "high" | "unknown";
  active_campaigns: string[];
  fetched_at: string;
};

export type SocialPresence = {
  instagram_handle: string | null;
  instagram_followers: number | null;
  twitter_handle: string | null;
  twitter_followers: number | null;
  facebook_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  total_social_score: number; // 0–10
};

export type SocialEnrichmentResult = {
  linkedin: LinkedInProfile | null;
  ads: AdSignals;
  social: SocialPresence;
  leadership_emails_hint: string[];
  enriched_at: string;
};

// ── LinkedIn URL discovery via SERP ───────────────────────────────────────────

/**
 * Finds the LinkedIn company slug/URL by searching Google.
 * Returns the slug (e.g. "red-bull") or null.
 */
export async function findLinkedInUrl(companyName: string): Promise<string | null> {
  try {
    const result = await searchGoogle(
      `${companyName} site:linkedin.com/company`,
      { lang: "pt-BR", country: "br", numResults: 5, timeoutMs: 30_000 }
    );

    for (const r of result.organic_results) {
      const match = r.url?.match(/linkedin\.com\/company\/([^/?#]+)/);
      if (match) {
        const slug = match[1];
        logger.info("LinkedIn URL found via SERP", { company: companyName, slug });
        return `https://www.linkedin.com/company/${slug}/`;
      }
    }
    return null;
  } catch (err) {
    logger.warn("LinkedIn URL discovery failed", { company: companyName, error: String(err) });
    return null;
  }
}

// ── LinkedIn profile scrape ───────────────────────────────────────────────────

/**
 * Scrapes a LinkedIn company page using automation-lab/linkedin-company-scraper.
 * No login needed. ~$0.003/company on free Apify tier.
 * Auto-discovers the LinkedIn URL via SERP if not provided.
 */
export async function scrapeLinkedIn(
  companyName: string,
  linkedinUrl?: string
): Promise<LinkedInProfile | null> {
  try {
    const url = linkedinUrl ?? await findLinkedInUrl(companyName);
    if (!url) {
      logger.info("LinkedIn URL not found, skipping scrape", { company: companyName });
      return null;
    }

    const result = await runActor<RawLinkedInItem>(
      "automation-lab~linkedin-company-scraper",
      {
        companyUrls: [url],
        maxItems: 1,
      },
      { timeoutMs: 45_000, maxItems: 5, retries: 2 }
    );

    if (!result.items.length) return null;
    const raw = result.items[0];

    const profile: LinkedInProfile = {
      name: raw.name ?? null,
      description: raw.description ?? raw.tagline ?? null,
      website: raw.website ?? null,
      industry: raw.industry ?? null,
      employee_count: raw.staffCount
        ? String(raw.staffCount)
        : (raw.employeeCount ?? null),
      headquarters: [raw.headquartersCity, raw.headquartersCountry]
        .filter(Boolean)
        .join(", ") || null,
      founded: raw.foundedOn?.year ? String(raw.foundedOn.year) : null,
      specialties: raw.specialties ?? [],
      follower_count: raw.followersCount ?? null,
      linkedin_url: url,
      fetched_at: new Date().toISOString(),
    };

    logger.info("LinkedIn scrape complete", {
      company: companyName,
      employees: profile.employee_count,
      followers: profile.follower_count,
    });

    return profile;
  } catch (err) {
    logger.warn("LinkedIn scrape failed, skipping", {
      company: companyName,
      error: String(err),
    });
    return null;
  }
}

// ── Ad signals via Google SERP ────────────────────────────────────────────────

/**
 * Detect active ad campaigns by searching for the company in Google
 * and inspecting paid ad results and organic signals.
 */
export async function detectAdSignals(
  companyName: string,
  domain: string
): Promise<AdSignals> {
  const fetched_at = new Date().toISOString();

  try {
    const result = await searchGoogle(
      `"${companyName}" campanha OR patrocínio OR marketing 2025 OR 2026`,
      { lang: "pt-BR", country: "br", numResults: 10, timeoutMs: 35_000 }
    );

    const ads = result.ads ?? [];
    const organic = result.organic_results ?? [];
    const orgText = organic
      .map((o) => `${o.title ?? ""} ${o.description ?? ""}`)
      .join(" ")
      .toLowerCase();

    const spendSignal: AdSignals["estimated_ad_spend_signal"] =
      ads.length >= 3 ? "high" :
      ads.length >= 1 ? "medium" :
      (orgText.includes("campanha") || orgText.includes("patrocínio")) ? "low" :
      "unknown";

    const activeCampaigns: string[] = [];
    if (orgText.includes("copa")) activeCampaigns.push("Copa do Brasil");
    if (orgText.includes("sustentabilidade") || orgText.includes("verde")) activeCampaigns.push("Sustentabilidade");
    if (orgText.includes("natal") || orgText.includes("fim de ano")) activeCampaigns.push("Natal/Fim de ano");
    if (orgText.includes("esport") || orgText.includes("futebol")) activeCampaigns.push("Esportes");

    return {
      has_active_google_ads: ads.length > 0,
      has_active_meta_ads: orgText.includes("facebook") || orgText.includes("instagram"),
      ad_headlines: ads.slice(0, 4).map((a) => a.title ?? "").filter(Boolean),
      ad_descriptions: ads.slice(0, 4).map((a) => a.description ?? "").filter(Boolean),
      estimated_ad_spend_signal: spendSignal,
      active_campaigns: activeCampaigns,
      fetched_at,
    };
  } catch (err) {
    logger.warn("Ad signal detection failed", { company: companyName, error: String(err) });
    return {
      has_active_google_ads: false,
      has_active_meta_ads: false,
      ad_headlines: [],
      ad_descriptions: [],
      estimated_ad_spend_signal: "unknown",
      active_campaigns: [],
      fetched_at,
    };
  }
}

// ── Social presence extraction ────────────────────────────────────────────────

/**
 * Builds social presence from scraped website data + LinkedIn profile.
 * Scores 0–10 based on presence and follower signals.
 */
export function extractSocialPresence(
  scrapedData: Record<string, unknown>,
  linkedIn: LinkedInProfile | null
): SocialPresence {
  const links = (scrapedData.social_links as string[]) ?? [];

  const instagram =
    (scrapedData.instagram as string) ??
    links.find((l) => l.includes("instagram.com")) ??
    null;
  const twitter =
    (scrapedData.twitter as string) ??
    links.find((l) => l.includes("twitter.com") || l.includes("x.com")) ??
    null;
  const facebook =
    (scrapedData.facebook as string) ??
    links.find((l) => l.includes("facebook.com")) ??
    null;
  const youtube =
    (scrapedData.youtube as string) ??
    links.find((l) => l.includes("youtube.com")) ??
    null;
  const linkedinUrl =
    linkedIn?.linkedin_url ??
    (scrapedData.linkedin as string) ??
    links.find((l) => l.includes("linkedin.com")) ??
    null;

  // Score: each platform adds points; follower signals add bonus
  let score = 0;
  if (instagram) score += 2;
  if (twitter) score += 1.5;
  if (linkedinUrl) score += 2.5;
  if (facebook) score += 1.5;
  if (youtube) score += 1.5;
  if (linkedIn?.follower_count && linkedIn.follower_count > 10000) score += 1;

  return {
    instagram_handle: instagram ? extractHandle(instagram) : null,
    instagram_followers: null,
    twitter_handle: twitter ? extractHandle(twitter) : null,
    twitter_followers: null,
    facebook_url: facebook ?? null,
    youtube_url: youtube ?? null,
    linkedin_url: linkedinUrl ?? null,
    total_social_score: Math.min(Math.round(score * 10) / 10, 10),
  };
}

// ── Full enrichment orchestration ─────────────────────────────────────────────

export async function enrichCompanySocial(
  companyName: string,
  domain: string,
  scrapedData: Record<string, unknown> = {}
): Promise<SocialEnrichmentResult> {
  const [linkedin, ads] = await Promise.all([
    scrapeLinkedIn(companyName),
    detectAdSignals(companyName, domain),
  ]);

  const social = extractSocialPresence(scrapedData, linkedin);

  const leadershipNames: string[] = [];

  return {
    linkedin,
    ads,
    social,
    leadership_emails_hint: leadershipNames,
    enriched_at: new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractHandle(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] ?? url;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?[^/]+\//, "").split("/")[0] ?? url;
  }
}

// ── Raw Apify types ───────────────────────────────────────────────────────────

type RawLinkedInItem = {
  name?: string;
  description?: string;
  tagline?: string;
  website?: string;
  industry?: string;
  staffCount?: number;
  employeeCount?: string;
  headquartersCity?: string;
  headquartersCountry?: string;
  foundedOn?: { year?: number };
  specialties?: string[];
  followersCount?: number;
};

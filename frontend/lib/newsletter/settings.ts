export const NEWSLETTER_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type NewsletterDay = (typeof NEWSLETTER_DAYS)[number];

export type NewsItem = { title: string; body: string; link: string };

export type NewsletterBlocks = {
  header: { logo: boolean; title: string };
  intro: string;
  newsItems: NewsItem[];
  cta: { text: string; url: string };
};

export type NewsletterSettings = {
  subject: string;
  send_day: NewsletterDay;
  send_hour: string;
  industries: string[];
  blocks: NewsletterBlocks;
};

export const DEFAULT_NEWSLETTER_BLOCKS: NewsletterBlocks = {
  header: { logo: true, title: "Coritiba FC — Sponsorship Update" },
  intro: "Olá! Confira as últimas oportunidades de patrocínio do Coritiba FC.",
  newsItems: [
    { title: "Nova oportunidade de patrocínio", body: "Detalhe da oportunidade aqui.", link: "" },
    { title: "Resultados da última rodada", body: "Coritiba continua em destaque.", link: "" },
  ],
  cta: { text: "Ver propostas", url: "https://coritiba.com.br/patrocinio" },
};

export const DEFAULT_NEWSLETTER_SETTINGS: NewsletterSettings = {
  subject: "Coritiba FC — Oportunidade de Patrocínio",
  send_day: "Tuesday",
  send_hour: "09:00",
  industries: [],
  blocks: DEFAULT_NEWSLETTER_BLOCKS,
};

export const DEFAULT_SEGMENT_NAME = "default";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseHour(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 23) {
    return `${String(raw).padStart(2, "0")}:00`;
  }
  const s = String(raw ?? "").trim();
  const m = /^([01]?\d|2[0-3]):00$/.exec(s);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:00`;
}

function dayToInt(day: NewsletterDay): number {
  return NEWSLETTER_DAYS.indexOf(day) + 1;
}

function intToDay(n: unknown): NewsletterDay | null {
  const i = typeof n === "number" ? n : Number(n);
  if (!Number.isInteger(i) || i < 1 || i > 7) return null;
  return NEWSLETTER_DAYS[i - 1];
}

function parseNewsItems(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return DEFAULT_NEWSLETTER_BLOCKS.newsItems;
  const items = raw.slice(0, 3).map((item) => {
    const it = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      title: asString(it.title),
      body: asString(it.body),
      link: asString(it.link),
    };
  });
  return items.length > 0 ? items : DEFAULT_NEWSLETTER_BLOCKS.newsItems;
}

function parseBlocks(raw: unknown): NewsletterBlocks {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const header = b.header && typeof b.header === "object" ? (b.header as Record<string, unknown>) : {};
  const cta = b.cta && typeof b.cta === "object" ? (b.cta as Record<string, unknown>) : {};
  const title = asString(header.title, DEFAULT_NEWSLETTER_BLOCKS.header.title).trim()
    || DEFAULT_NEWSLETTER_BLOCKS.header.title;
  return {
    header: {
      logo: header.logo !== false,
      title,
    },
    intro: asString(b.intro, DEFAULT_NEWSLETTER_BLOCKS.intro),
    newsItems: parseNewsItems(b.newsItems),
    cta: {
      text: asString(cta.text, DEFAULT_NEWSLETTER_BLOCKS.cta.text),
      url: asString(cta.url, DEFAULT_NEWSLETTER_BLOCKS.cta.url),
    },
  };
}

/** Body from the settings form / PUT. Header title and weekday are required. */
export function parseNewsletterSettingsPut(body: unknown): ParseResult<NewsletterSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid payload" };
  }
  const b = body as Record<string, unknown>;

  const headerIn = b.blocks && typeof b.blocks === "object" && !Array.isArray(b.blocks)
    ? (b.blocks as Record<string, unknown>).header
    : b.header;
  const headerObj = headerIn && typeof headerIn === "object" ? (headerIn as Record<string, unknown>) : {};
  const headerTitle = asString(headerObj.title ?? b.header_title).trim();
  if (!headerTitle) {
    return { ok: false, error: "Header title is required" };
  }

  const dayRaw = asString(b.send_day, DEFAULT_NEWSLETTER_SETTINGS.send_day);
  if (!(NEWSLETTER_DAYS as readonly string[]).includes(dayRaw)) {
    return { ok: false, error: "Unknown send day" };
  }
  const hour = parseHour(b.send_hour ?? DEFAULT_NEWSLETTER_SETTINGS.send_hour);
  if (!hour) {
    return { ok: false, error: "send_hour must be HH:00" };
  }

  const industries = Array.isArray(b.industries)
    ? b.industries.map((x) => String(x)).filter(Boolean)
    : [];

  const blocks = parseBlocks(b.blocks);
  blocks.header.title = headerTitle;

  return {
    ok: true,
    data: {
      subject: asString(b.subject, DEFAULT_NEWSLETTER_SETTINGS.subject),
      send_day: dayRaw as NewsletterDay,
      send_hour: hour,
      industries,
      blocks,
    },
  };
}

export function settingsToRow(settings: NewsletterSettings): {
  name: string;
  subject_template: string;
  send_day: number;
  send_hour: number;
  industry_filter: string | null;
  config: NewsletterSettings["blocks"] & { industries: string[] };
} {
  const hour = Number(settings.send_hour.slice(0, 2));
  return {
    name: DEFAULT_SEGMENT_NAME,
    subject_template: settings.subject,
    send_day: dayToInt(settings.send_day),
    send_hour: hour,
    industry_filter: settings.industries.length ? settings.industries.join(",") : null,
    config: { ...settings.blocks, industries: settings.industries },
  };
}

export function rowToSettings(row: Record<string, unknown> | null | undefined): NewsletterSettings {
  if (!row) return DEFAULT_NEWSLETTER_SETTINGS;
  const config = row.config && typeof row.config === "object" && !Array.isArray(row.config)
    ? (row.config as Record<string, unknown>)
    : {};
  const blocks = parseBlocks(config);
  const day = intToDay(row.send_day) ?? DEFAULT_NEWSLETTER_SETTINGS.send_day;
  const hour = parseHour(row.send_hour) ?? DEFAULT_NEWSLETTER_SETTINGS.send_hour;
  const industriesFromConfig = Array.isArray(config.industries)
    ? config.industries.map((x) => String(x)).filter(Boolean)
    : [];
  const industriesFromCol = asString(row.industry_filter)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    subject: asString(row.subject_template, DEFAULT_NEWSLETTER_SETTINGS.subject),
    send_day: day,
    send_hour: hour,
    industries: industriesFromConfig.length ? industriesFromConfig : industriesFromCol,
    blocks,
  };
}

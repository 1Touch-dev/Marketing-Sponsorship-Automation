/**
 * Parses `[[TOKEN]]` and `[[IMG:KEY]]` placeholders out of an uploaded HTML
 * presentation template, and substitutes final values back in for a render.
 *
 * Text tokens:  [[COMPANY_NAME]], [[EXEC_SUMMARY]], [[CTA]], any custom token.
 * Image tokens: [[IMG:JERSEY_CHEST]], [[IMG:STADIUM_LED]], [[IMG:COMPANY_LOGO]].
 *   The part after "IMG:" is a free-form key the template author chooses —
 *   the placeholder config on the template maps it to an image_type
 *   (jersey/stadium/campaign/logo) + specific placement/prompt.
 */

const PLACEHOLDER_RE = /\[\[([A-Z0-9_:]+)\]\]/g;

export type PlaceholderKind = "text" | "image";

export type ImagePlaceholderType = "jersey" | "stadium" | "campaign" | "logo";

export type PlaceholderConfig = {
  token: string; // e.g. "COMPANY_NAME" or "IMG:JERSEY_CHEST"
  kind: PlaceholderKind;
  label?: string;
  /** For kind="image" only */
  image_type?: ImagePlaceholderType;
  placement?: string; // jersey placement id / stadium placement id / campaign scene id
  kit_type?: string; // jersey kit type
  prompt_hint?: string;
  base_image_url?: string | null; // operator-uploaded custom base to use instead of the built-in photo
  use_company_logo?: boolean; // default true — use the company's scraped/uploaded logo
};

export function extractPlaceholderTokens(html: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE);
  while ((match = re.exec(html)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function tokenKind(token: string): PlaceholderKind {
  return token.startsWith("IMG:") ? "image" : "text";
}

export function defaultLabelForToken(token: string): string {
  const base = token.startsWith("IMG:") ? token.slice(4) : token;
  return base
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function guessImageType(token: string): ImagePlaceholderType {
  const t = token.toLowerCase();
  if (t.includes("logo")) return "logo";
  if (t.includes("stadium") || t.includes("led") || t.includes("scoreboard") || t.includes("facade")) return "stadium";
  if (t.includes("campaign") || t.includes("street") || t.includes("lifestyle") || t.includes("training_ground")) return "campaign";
  return "jersey";
}

/**
 * Builds a default placeholder config array from tokens found in the HTML,
 * merging in any existing config (so previously-set prompts/types survive a
 * re-upload / re-scan of the same template).
 */
export function buildPlaceholderConfig(
  html: string,
  existing: PlaceholderConfig[] = [],
): PlaceholderConfig[] {
  const tokens = extractPlaceholderTokens(html);
  const existingByToken = new Map(existing.map((e) => [e.token, e]));

  return tokens.map((token) => {
    const prior = existingByToken.get(token);
    if (prior) return prior;

    const kind = tokenKind(token);
    if (kind === "text") {
      return { token, kind, label: defaultLabelForToken(token) };
    }

    return {
      token,
      kind,
      label: defaultLabelForToken(token),
      image_type: guessImageType(token),
      use_company_logo: true,
    };
  });
}

/** Escapes a string for safe embedding into HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Substitutes text tokens and image URLs into the template HTML.
 * `images` maps the exact "IMG:KEY" token to a final URL. Any placeholder
 * without a supplied value is left as an empty string (text) or a 1x1
 * transparent pixel comment removed (image tags collapse silently).
 */
export function renderTemplateHtml(
  html: string,
  values: { text: Record<string, string>; images: Record<string, string> },
): string {
  return html.replace(PLACEHOLDER_RE, (_match, token: string) => {
    if (token.startsWith("IMG:")) {
      return values.images[token] ? escapeHtml(values.images[token]) : "";
    }
    return values.text[token] !== undefined ? escapeHtml(values.text[token]) : "";
  });
}

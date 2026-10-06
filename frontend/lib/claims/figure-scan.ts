/**
 * Finds audience-style figures in free text (Task 8).
 *
 * The AI writes proposal narrative, and a person can edit it, so a number can
 * appear that is not in the claims registry ("audiências que superam 1 milhão
 * de telespectadores"). This scans for such numbers and says which ones no
 * usable claim supports. It reports; it never rewrites or blocks.
 *
 * What counts as a figure: a number with a scale word (mil, milhão, mi, M, K,
 * bilhão) or a percent sign, or a plain number of 1,000 or more. Not counted:
 * money (R$ ...), a bare year, and small counts like "25 matches" or "M1–M2".
 */

export interface Figure {
  raw: string;
  /** The number the text states, scale applied (1,5 milhão → 1500000). */
  value: number;
  percent: boolean;
  index: number;
}

const SCALES: Array<[RegExp, number]> = [
  [/^(bilh[ãa]o|bilh[õo]es|bi|b)$/i, 1e9],
  [/^(milh[ãa]o|milh[õo]es|mi|m)$/i, 1e6],
  [/^(mil|k)$/i, 1e3],
];

// digits with optional separators, then an optional scale word or percent sign
const FIGURE_RE = /(?<![\p{L}\d.,#])(R\$\s*)?(\d+(?:[.,]\d+)*)\s*(bilh[ãa]o|bilh[õo]es|milh[ãa]o|milh[õo]es|mil|mi|bi|%|[MKB])?(?![\p{L}\d])/giu;

/**
 * "1.95", "1,5", "3.7", "23.000", "40.502", "1.234.567". When every group after
 * the first has exactly three digits it is thousands grouping; otherwise the
 * last separator is a decimal point.
 */
export function parseNumber(token: string): number {
  const parts = token.split(/[.,]/);
  if (parts.length === 1) return Number(parts[0]);
  if (parts.slice(1).every((p) => p.length === 3)) return Number(parts.join(""));
  return Number(parts.slice(0, -1).join("") + "." + parts[parts.length - 1]);
}

export function extractFigures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(FIGURE_RE)) {
    if (m[1]) continue; // money: a deal term, not an audience claim
    if (/^0\d/.test(m[2])) continue; // 005742: a code or colour, not a quantity
    const scaleWord = m[3];
    const percent = scaleWord === "%";
    const scale = scaleWord && !percent ? SCALES.find(([re]) => re.test(scaleWord))?.[1] ?? 1 : 1;
    const base = parseNumber(m[2]);
    if (!Number.isFinite(base)) continue;
    const value = base * scale;

    const isYear = scale === 1 && !percent && Number.isInteger(value) && value >= 1900 && value <= 2100 && !/[.,]/.test(m[2]);
    const isFigure = percent || scale > 1 || value >= 1000;
    if (!isFigure || isYear) continue;
    out.push({ raw: m[0].trim(), value, percent, index: m.index ?? 0 });
  }
  return out;
}

export interface UnsourcedFigure {
  figure: string;
  context: string;
  field: string;
}

/**
 * Figures in `fields` that no usable claim states. A figure is supported when
 * its value equals a number found in a usable claim's value.
 */
export function findUnsourcedFigures(fields: Record<string, string>, claimValues: string[]): UnsourcedFigure[] {
  const supported = new Set<number>();
  for (const v of claimValues) for (const f of extractFigures(v)) supported.add(f.value);
  // A claim value like "18.000–28.000" or "1.5M+" is found by the same extractor; a bare small
  // number in a claim (e.g. "58") is not a figure there, so also accept plain numeric tokens.
  for (const v of claimValues) for (const m of v.matchAll(/\d+(?:[.,]\d+)*/g)) supported.add(parseNumber(m[0]));

  const out: UnsourcedFigure[] = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    for (const f of extractFigures(text)) {
      if (supported.has(f.value)) continue;
      const start = Math.max(0, f.index - 45);
      const context = text.slice(start, f.index + f.raw.length + 45).replace(/\s+/g, " ").trim();
      out.push({ figure: f.raw, context, field });
    }
  }
  return out;
}

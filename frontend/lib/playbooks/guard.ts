/**
 * A relationship-first email must carry no link and no price (Task 13). The
 * prompt says so; this checks the model's actual output, so a slip is refused
 * instead of saved.
 */
export interface Violation { rule: string; found: string }

const CHECKS: Array<{ rule: string; re: RegExp }> = [
  { rule: "contains a link", re: /(https?:\/\/|www\.)\S+/i },
  { rule: "mentions a price", re: /R\$\s?\d|\b\d[\d.,]*\s?(reais|mil reais|milh[õo]es de reais)\b/i },
  { rule: "mentions a percentage or discount", re: /\b\d+\s?%|\bdesconto\b|\bpromo[cç][aã]o\b/i },
  { rule: "contains a placeholder", re: /\[[^\]]{1,30}\]/ },
  { rule: "refers to a proposal or package", re: /\b(proposta comercial|pacote de patroc[ií]nio|cota de patroc[ií]nio|segue (a )?proposta|anexo)\b/i },
];

export function relationshipEmailViolations(text: string): Violation[] {
  const out: Violation[] = [];
  for (const c of CHECKS) {
    const m = text.match(c.re);
    if (m) out.push({ rule: c.rule, found: m[0].slice(0, 40) });
  }
  return out;
}

import { displayValue, type SponsorClaimMap } from "./sponsor-claims";

/** Claim keys the incentive-law proposal text can use. */
export const LEI_CLAIM_KEYS = ["law.esporte.pj_deduction_cap", "law.rouanet.pj_deduction_cap"] as const;

/**
 * The "lei_overview" paragraph of the incentive-law proposal template (Task 9).
 *
 * It used to state "dedução de até 100% do valor investido" with no source,
 * which is not what the sports incentive law says (the limit is a percentage of
 * the tax owed). A limit is now written only when a verified claim supplies it;
 * without one the paragraph names the laws and says the limits are to be
 * confirmed, and carries no number.
 */
export function buildLeiOverview(claims: SponsorClaimMap): string {
  const esporte = claims["law.esporte.pj_deduction_cap"];
  const rouanet = claims["law.rouanet.pj_deduction_cap"];

  const parts: string[] = [];
  parts.push(
    esporte
      ? `Pela Lei de Incentivo ao Esporte (Lei nº 11.438/2006), empresas podem destinar ao patrocínio ou à doação a projetos esportivos aprovados até ${displayValue(esporte)}.`
      : "A Lei de Incentivo ao Esporte (Lei nº 11.438/2006) permite que empresas destinem parte do imposto de renda devido ao patrocínio ou à doação a projetos esportivos aprovados, dentro dos limites e condições previstos em lei.",
  );
  parts.push(
    rouanet
      ? `Pela Lei Rouanet (Lei nº 8.313/1991), o limite para pessoa jurídica é de ${displayValue(rouanet)}.`
      : "A Lei Rouanet (Lei nº 8.313/1991) segue regra própria para projetos culturais aprovados.",
  );
  if (!esporte || !rouanet) {
    parts.push("Os percentuais e a elegibilidade do patrocinador devem ser confirmados com sua equipe fiscal antes da decisão.");
  }
  return parts.join(" ");
}

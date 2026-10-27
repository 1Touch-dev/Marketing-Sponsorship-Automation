import { formatDate } from "../utils";

export type ConnectionLang = "pt" | "en";
export type ConnectionStateName = "not_configured" | "key_rejected" | "failing" | "unverified" | "connected";

/** Facts the banner needs. The English `label` and `detail` from the server are not used. */
export type ConnectionFacts = {
  state: ConnectionStateName;
  last_error?: string | null;
  last_error_at?: string | null;
  last_push_ok_at?: string | null;
  key_checked_at?: string | null;
  last_error_kind?: "push" | "check" | null;
};

const when = (iso: string | null | undefined, lang: ConnectionLang) =>
  iso ? formatDate(iso) : lang === "pt" ? "nunca" : "never";

/** Headline, one-sentence reason, and the short name used on the status card. */
export function connectionCopy(facts: ConnectionFacts, lang: ConnectionLang, name = "Pipedrive"): { label: string; detail: string; stateName: string } {
  const pt = lang === "pt";
  const checked = facts.key_checked_at ? (pt ? ` (verificada ${when(facts.key_checked_at, lang)})` : ` (checked ${when(facts.key_checked_at, lang)})`) : "";
  const lastPush = facts.last_push_ok_at
    ? pt ? ` O último envio bem-sucedido foi ${when(facts.last_push_ok_at, lang)}.` : ` The last good push was ${when(facts.last_push_ok_at, lang)}.`
    : pt ? " Nada foi enviado com sucesso ainda." : " Nothing has been pushed successfully yet.";
  const error = facts.last_error ?? (pt ? "erro desconhecido" : "unknown error");
  const failedLead = facts.last_error_kind === "check"
    ? pt ? "A última verificação de conexão falhou" : "The last connection check failed"
    : pt ? "O último envio falhou" : "The last push failed";

  switch (facts.state) {
    case "not_configured":
      return {
        stateName: pt ? "Não configurado" : "Not configured",
        label: pt ? `${name} não está conectado` : `${name} is not connected`,
        detail: pt ? `Nenhuma chave de API está definida neste servidor, então nada é enviado ao ${name}.` : `No API key is set on this server, so nothing is sent to ${name}.`,
      };
    case "key_rejected":
      return {
        stateName: pt ? "Chave de API inválida" : "Invalid API key",
        label: pt ? `O ${name} recusou a chave de API` : `${name} rejected the API key`,
        detail: pt
          ? `O ${name} respondeu que a chave não é válida${checked}. Nada está sendo enviado.`
          : `${name} answered that the key is not valid${checked}. Nothing is being sent.`,
      };
    case "failing":
      return {
        stateName: pt ? "Último envio falhou" : "Last push failed",
        label: pt ? `A sincronização do ${name} está falhando` : `${name} sync is failing`,
        detail: `${failedLead} (${when(facts.last_error_at, lang)}): ${error}.${lastPush}`,
      };
    case "unverified":
      return {
        stateName: pt ? "Não verificado" : "Not checked",
        label: pt ? `A chave do ${name} está definida, mas ainda não foi verificada` : `${name} key is set but has not been checked`,
        detail: (pt
          ? `Uma chave está definida, mas o ${name} ainda não respondeu, então não se sabe se funciona.`
          : `A key is set, but ${name} has not answered yet, so it is not known to work.`)
          + (facts.last_push_ok_at ? (pt ? ` Último envio bem-sucedido: ${when(facts.last_push_ok_at, lang)}.` : ` Last successful push: ${when(facts.last_push_ok_at, lang)}.`) : ""),
      };
    default:
      return {
        stateName: pt ? "Conectado" : "Connected",
        label: pt ? `O ${name} está conectado` : `${name} is connected`,
        detail: facts.last_push_ok_at
          ? pt ? `Último envio bem-sucedido: ${when(facts.last_push_ok_at, lang)}.` : `Last successful push: ${when(facts.last_push_ok_at, lang)}.`
          : pt ? "A chave foi aceita. Nada foi enviado ainda." : "The key is accepted. Nothing has been pushed yet.",
      };
  }
}

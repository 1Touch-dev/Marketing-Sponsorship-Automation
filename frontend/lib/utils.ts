import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BRAZIL_TZ = "America/Sao_Paulo";
const BRAZIL_LOCALE = "pt-BR";

/** Timestamps for operator UI: Brazil time, dd/mm/yyyy, 24h. Independent of server TZ and LangToggle. */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(BRAZIL_LOCALE, {
    timeZone: BRAZIL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Calendar dates (YYYY-MM-DD) without a UTC-midnight shift into the previous Brazil day. */
export function formatDateOnly(value: string | Date | null | undefined) {
  if (!value) return "—";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(BRAZIL_LOCALE, {
    timeZone: BRAZIL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function truncate(s: string | null | undefined, max = 120) {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

"use client";

import { useLang, t } from "@/lib/i18n/lang-context";

export function HojeTitle() {
  const { lang } = useLang();
  return <h1 className="text-2xl font-semibold tracking-tight">{t("Hoje", lang)}</h1>;
}

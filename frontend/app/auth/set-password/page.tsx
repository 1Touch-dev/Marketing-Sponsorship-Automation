"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { CrestSpinner } from "@/components/brand/crest";
import { useLang } from "@/lib/i18n/lang-context";

type LinkType = "invite" | "recovery";

function isLinkType(v: string | null): v is LinkType {
  return v === "invite" || v === "recovery";
}

const COPY = {
  setTitle: { pt: "Defina sua senha", en: "Set your password" },
  resetTitle: { pt: "Redefina sua senha", en: "Reset your password" },
  sub: {
    pt: "Escolha uma senha para sua conta na plataforma de patrocínios do Coritiba FC.",
    en: "Choose a password for your Coritiba FC sponsorship platform account.",
  },
  newPw: { pt: "Nova senha", en: "New password" },
  confirmPw: { pt: "Confirmar senha", en: "Confirm password" },
  hint: { pt: "Mínimo de 8 caracteres.", en: "At least 8 characters." },
  submit: { pt: "Definir senha", en: "Set password" },
  saving: { pt: "Salvando…", en: "Saving…" },
  invalidLink: {
    pt: "Este link é inválido ou está incompleto.",
    en: "This link is invalid or incomplete.",
  },
  back: { pt: "Voltar ao login", en: "Back to sign in" },
  tooShort: { pt: "A senha deve ter pelo menos 8 caracteres.", en: "Password must be at least 8 characters." },
  mismatch: { pt: "As senhas não coincidem.", en: "Passwords do not match." },
  failed: {
    pt: "Não foi possível definir a senha. Tente novamente ou peça um novo link.",
    en: "Could not set your password. Try again or request a new link.",
  },
  wrong: { pt: "Algo deu errado. Tente novamente.", en: "Something went wrong. Please try again." },
} as const;

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 transition focus:border-[#00573f] focus:outline-none focus:ring-2 focus:ring-[#00573f]/30 disabled:bg-slate-100";

/**
 * Staff set-password / reset page.
 * Posts to /api/auth/set-password on submit only (no verifyOtp on load — Safe Links safe).
 * Server-side verifyOtp + admin.updateUserById avoids HttpOnly cookie conflicts.
 */
export default function SetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <AuthShell>
          <div className="flex min-h-[280px] items-center justify-center">
            <CrestSpinner size={56} />
          </div>
        </AuthShell>
      }
    >
      <SetPasswordForm />
    </React.Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useLang();
  const l = lang;
  const tokenHash = params.get("token_hash") ?? "";
  const typeParam = params.get("type");
  const type = isLinkType(typeParam) ? typeParam : null;

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const linkOk = Boolean(tokenHash && type);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tokenHash || !type) {
      setError(COPY.invalidLink[l]);
      return;
    }
    if (password.length < 8) {
      setError(COPY.tooShort[l]);
      return;
    }
    if (password !== confirm) {
      setError(COPY.mismatch[l]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : COPY.failed[l]);
        return;
      }
      router.replace("/login?password_set=1");
      router.refresh();
    } catch {
      setError(COPY.wrong[l]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#00573f]/10 text-[#00573f]">
          <KeyRound className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {type === "invite" ? COPY.setTitle[l] : COPY.resetTitle[l]}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{COPY.sub[l]}</p>
      </div>

      {!linkOk && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {COPY.invalidLink[l]}{" "}
          <a href="/login" className="font-medium underline">
            {COPY.back[l]}
          </a>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <a href="/login" className="font-medium underline">
            {COPY.back[l]}
          </a>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">
            {COPY.newPw[l]}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={!linkOk || loading}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-slate-400">{COPY.hint[l]}</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">
            {COPY.confirmPw[l]}
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            disabled={!linkOk || loading}
            className={INPUT}
          />
        </div>
        <button
          type="submit"
          disabled={!linkOk || loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00573f] px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#006b4d] focus:outline-none focus:ring-2 focus:ring-[#00573f]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" /> {COPY.saving[l]}
            </>
          ) : (
            COPY.submit[l]
          )}
        </button>
      </form>
    </AuthShell>
  );
}

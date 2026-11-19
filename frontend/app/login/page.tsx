"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { CrestSpinner } from "@/components/brand/crest";
import { useLang } from "@/lib/i18n/lang-context";

const COPY = {
  heading: { pt: "Entrar", en: "Sign in" },
  sub: {
    pt: "Use o e-mail e a senha da sua conta para acessar a plataforma.",
    en: "Use your account email and password to access the platform.",
  },
  passwordSet: {
    pt: "Senha definida, faça login.",
    en: "Password set, please sign in.",
  },
  email: { pt: "E-mail", en: "Email" },
  password: { pt: "Senha", en: "Password" },
  forgot: { pt: "Esqueceu a senha?", en: "Forgot password?" },
  show: { pt: "Mostrar senha", en: "Show password" },
  hide: { pt: "Ocultar senha", en: "Hide password" },
  submit: { pt: "Entrar", en: "Sign in" },
  submitting: { pt: "Entrando…", en: "Signing in…" },
  forgotIntro: {
    pt: "Informe seu e-mail. Se houver uma conta, enviaremos um link para redefinir a senha.",
    en: "Enter your email. If an account exists, we will send a link to reset your password.",
  },
  forgotSend: { pt: "Enviar link de redefinição", en: "Send reset link" },
  forgotSending: { pt: "Enviando…", en: "Sending…" },
  forgotDone: {
    pt: "Se este e-mail tiver uma conta, enviamos um link.",
    en: "If this email has an account, we sent a link.",
  },
  needAccess: {
    pt: "Precisa de acesso? Fale com o administrador da plataforma.",
    en: "Need access? Contact the platform administrator.",
  },
  failed: { pt: "Não foi possível entrar. Tente novamente.", en: "Login failed. Please try again." },
  network: {
    pt: "Erro de rede. Verifique sua conexão.",
    en: "Network error. Please check your connection.",
  },
} as const;

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 transition focus:border-[#00573f] focus:outline-none focus:ring-2 focus:ring-[#00573f]/30";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useLang();
  const l = lang;
  const from = params.get("from") || "/";
  const passwordSet = params.get("password_set") === "1";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [forgotMessage, setForgotMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || COPY.failed[l]);
        return;
      }

      const destination = decodeURIComponent(from);
      router.replace(destination === "/login" ? "/" : destination);
      router.refresh();
    } catch {
      setError(COPY.network[l]);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotMessage(null);
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail || email }),
      });
      await res.json().catch(() => ({}));
      setForgotMessage(COPY.forgotDone[l]);
    } catch {
      setForgotMessage(COPY.forgotDone[l]);
    } finally {
      setForgotLoading(false);
    }
  }

  // After a successful sign-in the page is replaced; show the crest meanwhile
  // instead of leaving a dead form on screen.
  if (loading) {
    return (
      <AuthShell>
        <div className="flex min-h-[320px] items-center justify-center">
          <CrestSpinner size={64} label={COPY.submitting[l]} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#00573f]/10 text-[#00573f]">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{COPY.heading[l]}</h2>
        <p className="mt-1 text-sm text-slate-500">{COPY.sub[l]}</p>
      </div>

      {passwordSet && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {COPY.passwordSet[l]}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">
            {COPY.email[l]}
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@coritiba.com.br"
            required
            autoComplete="email"
            className={INPUT}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
              {COPY.password[l]}
            </label>
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotEmail(email);
                setForgotMessage(null);
              }}
              className="text-xs font-medium text-[#00573f] transition hover:underline"
            >
              {COPY.forgot[l]}
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={showPw ? COPY.hide[l] : COPY.show[l]}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00573f] px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#006b4d] focus:outline-none focus:ring-2 focus:ring-[#00573f]/40 focus:ring-offset-2"
        >
          <LogIn size={18} /> {COPY.submit[l]}
        </button>
      </form>

      {forgotOpen && (
        <form onSubmit={handleForgot} className="mt-6 space-y-3 border-t border-slate-200 pt-6">
          <p className="text-sm text-slate-600">{COPY.forgotIntro[l]}</p>
          <input
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            placeholder="voce@coritiba.com.br"
            required
            autoComplete="email"
            aria-label={COPY.email[l]}
            className={INPUT}
          />
          {forgotMessage && <p className="text-sm text-emerald-700">{forgotMessage}</p>}
          <button
            type="submit"
            disabled={forgotLoading}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {forgotLoading ? COPY.forgotSending[l] : COPY.forgotSend[l]}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">{COPY.needAccess[l]}</p>
    </AuthShell>
  );
}

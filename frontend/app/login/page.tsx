"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
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
        setError(data.error || "Login failed. Please try again.");
        return;
      }

      const destination = decodeURIComponent(from);
      router.replace(destination === "/login" ? "/" : destination);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
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
      const data = await res.json().catch(() => ({}));
      setForgotMessage(
        data.message ||
          "If this email has an account, we sent a link / Se este e-mail tiver uma conta, enviamos um link",
      );
    } catch {
      setForgotMessage("If this email has an account, we sent a link");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-green-600 shadow-2xl mb-4">
            <span className="text-3xl font-black text-white">C</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Coritiba FC</h1>
          <p className="text-green-300 text-sm mt-1">Commercial Intelligence Platform</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-1">Sign in</h2>
          <p className="text-green-300/70 text-sm mb-6">
            Enter your credentials to access the platform
          </p>

          {passwordSet && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-900/40 border border-emerald-500/40 text-emerald-200 text-sm">
              Password set, please sign in. / Senha definida, faça login.
            </div>
          )}

          {error && (
            <div role="alert" className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-green-200 mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@coritiba.com.br"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-green-200">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen((v) => !v);
                    setForgotEmail(email);
                    setForgotMessage(null);
                  }}
                  className="text-xs text-green-400 hover:text-green-300 transition"
                >
                  Forgot password?
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
                  className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Signing in…</>
              ) : (
                <><LogIn size={18} /> Sign in</>
              )}
            </button>
          </form>

          {forgotOpen && (
            <form onSubmit={handleForgot} className="mt-6 pt-6 border-t border-white/10 space-y-3">
              <p className="text-sm text-green-200">
                Enviaremos um link se houver uma conta. / We will send a link if an account exists.
              </p>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@coritiba.com.br"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              />
              {forgotMessage && (
                <p className="text-sm text-emerald-200/90">{forgotMessage}</p>
              )}
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-2 px-4 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 disabled:opacity-50 transition"
              >
                {forgotLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="text-center text-xs text-white/30 mt-6">
            Contact your admin if you need access
          </p>
        </div>
      </div>
    </div>
  );
}

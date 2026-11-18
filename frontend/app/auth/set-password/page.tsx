"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

type LinkType = "invite" | "recovery";

function isLinkType(v: string | null): v is LinkType {
  return v === "invite" || v === "recovery";
}

/**
 * Staff set-password / reset page.
 * verifyOtp runs ONLY on submit so email scanners do not burn the token.
 */
export default function SetPasswordPage() {
  return (
    <React.Suspense fallback={<Shell><p className="text-green-300/70 text-sm">Loading…</p></Shell>}>
      <SetPasswordForm />
    </React.Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
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
      setError("This link is invalid or incomplete. Request a new one from the login page.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const sb = supabaseBrowser();
      // verifyOtp only here — not on page load (Safe Links / scanners).
      const { error: verifyError } = await sb.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (verifyError) {
        setError("This link is invalid or has expired. Request a new one from the login page.");
        return;
      }

      const { error: updateError } = await sb.auth.updateUser({ password });
      if (updateError) {
        setError("Could not set your password. Try again or request a new link.");
        return;
      }

      await sb.auth.signOut();
      router.replace("/login?password_set=1");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <h2 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-green-400" />
        {type === "invite" ? "Set your password" : "Reset your password"}
      </h2>
      <p className="text-green-300/70 text-sm mb-6">
        Choose a new password for your Coritiba FC sponsorship account.
      </p>

      {!linkOk && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-sm">
          This link is invalid or incomplete.{" "}
          <a href="/login" className="underline">Back to sign in</a>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-sm">
          {error}{" "}
          <a href="/login" className="underline">Sign in</a>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-green-200 mb-1.5">
            New password
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
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-green-200 mb-1.5">
            Confirm password
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
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />
        </div>
        <button
          type="submit"
          disabled={!linkOk || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition"
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" /> Saving…</>
          ) : (
            "Set password"
          )}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
          {children}
        </div>
      </div>
    </div>
  );
}

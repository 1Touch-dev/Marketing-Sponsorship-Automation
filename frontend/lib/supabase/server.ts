import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import {
  sessionCookieOptions,
  withSessionCookieOptions,
  type RequestLike,
} from "@/lib/auth/session-cookie";

/**
 * NOTE: We intentionally do NOT pass the Database generic here. The hand-typed
 * Database type clashes with supabase-js inference for relational selects in
 * Next.js server components (results collapse to `never`).
 *
 * TODO(types): replace with generated types via:
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > frontend/types/database.generated.ts
 * then re-enable the generic on the clients below.
 */

/**
 * Service-role client (bypasses RLS). Use ONLY in trusted server contexts
 * (API routes, server actions, n8n callbacks). Never expose to the browser.
 *
 * IMPORTANT — Next.js fetch cache:
 * Next.js 14 App Router patches globalThis.fetch and caches all HTTP requests
 * by default. supabase-js v2 uses fetch internally, which means Supabase query
 * results can be served from the Next.js fetch cache (stale) unless we opt out.
 *
 * We pass `global: { fetch: ... }` with `cache: 'no-store'` so every call made
 * through this client always hits Supabase directly, never a stale cache entry.
 * This is safe for the service-role client because it is only used in server
 * contexts where we always need fresh data.
 */
export function supabaseAdmin() {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, cache: "no-store" }),
    },
  });
}

function requestLikeFromHeaders(): RequestLike {
  try {
    const h = headers();
    return { headers: { get: (name: string) => h.get(name) } };
  } catch {
    return {};
  }
}

/**
 * SSR client bound to the current request's cookies (anon key + RLS).
 */
export function supabaseServer() {
  const env = serverEnv();
  const cookieStore = cookies();
  const reqLike = requestLikeFromHeaders();
  const cookieOptions = sessionCookieOptions(reqLike);
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...withSessionCookieOptions(options, reqLike) });
        } catch {
          // Server components cannot write cookies; ignore.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: "", ...withSessionCookieOptions(options, reqLike) });
        } catch {
          /* no-op */
        }
      },
    },
  });
}

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Everything reachable without a staff session is declared, with the guard it relies on, in lib/auth/public-surface.ts
// (and a test checks each one). Anything not listed there needs a staff session.
import { isPublicPath } from "@/lib/auth/public-surface";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for static assets and public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) {
          try { req.cookies.set(name, value); } catch { /* no-op */ }
          res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]);
        },
        remove(name: string, options: Record<string, unknown>) {
          try { req.cookies.set(name, ""); } catch { /* no-op */ }
          res.cookies.set(name, "", options as Parameters<typeof res.cookies.set>[2]);
        },
      },
    }
  );

  // Refresh and validate session — getUser() verifies with the Auth server
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", redirect: "/login" },
        { status: 401 }
      );
    }
    // UI routes redirect to /login with return path
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", encodeURIComponent(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

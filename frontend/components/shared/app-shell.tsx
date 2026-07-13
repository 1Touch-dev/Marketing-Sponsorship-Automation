"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { GlobalSearch } from "@/components/shared/global-search";
import { QuickActionsFAB } from "@/components/shared/quick-actions";
import { UserRoleProvider } from "@/lib/auth/use-user-role";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /proposals/view/* lives in the (public) route group (no sidebar by design)
  // /proposals/[id]/view is the admin-linked landing page — strip sidebar so
  // sponsors don't see internal navigation when we share the direct link
  const isPublicView =
    pathname.startsWith("/proposals/view/") ||
    /^\/proposals\/[^/]+\/view$/.test(pathname) ||
    /^\/proposals\/[^/]+\/deck$/.test(pathname);
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    function onOpen() { /* handled inside GlobalSearch */ }
    window.addEventListener("open-global-search", onOpen);
    return () => window.removeEventListener("open-global-search", onOpen);
  }, []);

  if (isPublicView || isLoginPage) {
    if (isLoginPage) return <>{children}</>;
    return <>{children}</>;
  }

  return (
    <UserRoleProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 max-w-full">
          <MobileNav />
          <main className="flex-1">
            <ContentWrapper>{children}</ContentWrapper>
          </main>
        </div>
        {/* Global overlays */}
        <GlobalSearch />
        <QuickActionsFAB />
      </div>
    </UserRoleProvider>
  );
}

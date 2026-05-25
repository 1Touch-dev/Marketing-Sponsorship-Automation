"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { GlobalSearch } from "@/components/shared/global-search";
import { QuickActionsFAB } from "@/components/shared/quick-actions";
import { UserRoleProvider } from "@/lib/auth/use-user-role";

const PUBLIC_PREFIXES = ["/proposals/view/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    function onOpen() { /* handled inside GlobalSearch */ }
    window.addEventListener("open-global-search", onOpen);
    return () => window.removeEventListener("open-global-search", onOpen);
  }, []);

  if (isPublic || isLoginPage) {
    // Login page renders without any wrapper; public proposals use ContentWrapper
    if (isLoginPage) return <>{children}</>;
    return <ContentWrapper>{children}</ContentWrapper>;
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

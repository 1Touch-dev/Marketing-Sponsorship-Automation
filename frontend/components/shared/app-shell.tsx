"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ModuleSecondaryNav } from "@/components/shared/module-secondary-nav";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { GlobalSearch } from "@/components/shared/global-search";
import { QuickActionsFAB } from "@/components/shared/quick-actions";
import { UserRoleProvider } from "@/lib/auth/use-user-role";
import { isPublicPath } from "@/lib/auth/public-surface";

export function AppShell({
  children,
  clubName,
  tagline,
  crestUrl,
}: {
  children: React.ReactNode;
  clubName?: string;
  tagline?: string;
  crestUrl?: string | null;
}) {
  const pathname = usePathname();
  // Public marketing / share / portal / login: no staff chrome.
  // /proposals/[id]/view and /deck need a staff session but still strip the
  // sidebar so a shared admin link does not show Relacionamentos.
  const hideStaffChrome =
    !!isPublicPath(pathname) ||
    /^\/proposals\/[^/]+\/view$/.test(pathname) ||
    /^\/proposals\/[^/]+\/deck$/.test(pathname);

  useEffect(() => {
    function onOpen() { /* handled inside GlobalSearch */ }
    window.addEventListener("open-global-search", onOpen);
    return () => window.removeEventListener("open-global-search", onOpen);
  }, []);

  if (hideStaffChrome) {
    return <>{children}</>;
  }

  return (
    <UserRoleProvider>
      <div className="app-shell flex h-dvh overflow-hidden flex-col md:flex-row">
        <Sidebar clubName={clubName} tagline={tagline} crestUrl={crestUrl} />
        <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <MobileNav />
          <ModuleSecondaryNav />
          <main className="min-h-0 flex-1 overflow-y-auto">
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

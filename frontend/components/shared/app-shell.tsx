"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ContentWrapper } from "@/components/shared/content-wrapper";
import { GlobalSearch } from "@/components/shared/global-search";
import { QuickActionsFAB } from "@/components/shared/quick-actions";

const PUBLIC_PREFIXES = ["/proposals/view/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    function onOpen() { /* handled inside GlobalSearch */ }
    window.addEventListener("open-global-search", onOpen);
    return () => window.removeEventListener("open-global-search", onOpen);
  }, []);

  if (isPublic) {
    return <ContentWrapper>{children}</ContentWrapper>;
  }

  return (
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
  );
}

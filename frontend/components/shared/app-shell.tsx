"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ContentWrapper } from "@/components/shared/content-wrapper";

const PUBLIC_PREFIXES = ["/proposals/view/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // Public pages: no sidebar, no nav, just full-screen content
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
    </div>
  );
}

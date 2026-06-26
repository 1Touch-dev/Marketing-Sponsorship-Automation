"use client";

import { usePathname } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

const PUBLIC_PATHS = ["/proposals/view/"];

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // Public proposal pages: full-width, no sidebar padding, no admin chrome
    // The page itself provides its own bg/layout wrapper
    return <>{children}</>;
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <Breadcrumbs />
      {children}
    </div>
  );
}

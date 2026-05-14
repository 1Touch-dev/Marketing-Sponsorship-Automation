"use client";

import { usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/proposals/view/"];

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // Public proposal pages get full-width, no admin padding
    return (
      <style global jsx>{`
        .flex-1 { width: 100% !important; min-width: 100% !important; }
      `}</style>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      {children}
    </div>
  );
}

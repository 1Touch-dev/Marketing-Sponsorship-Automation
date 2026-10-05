"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { longestMatchingHref, moduleForPath } from "@/lib/nav/modules";
import { useLang, t } from "@/lib/i18n/lang-context";
import { cn } from "@/lib/utils";

/**
 * Short link row for the old top-level screens of the current work module.
 * Settings and Hoje do not get a row.
 */
export function ModuleSecondaryNav() {
  const pathname = usePathname();
  const { lang } = useLang();
  const navModule = moduleForPath(pathname);

  if (!navModule || navModule.utility || navModule.children.length === 0) return null;

  const activeHref = longestMatchingHref(
    pathname,
    navModule.children.map((child) => child.href),
  );

  return (
    <nav
      aria-label={t(navModule.labelKey, lang)}
      className="flex gap-1 overflow-x-auto border-b bg-card px-4 py-2 sm:px-6 lg:px-10"
    >
      {navModule.children.map((child) => {
        const active = child.href === activeHref;
        return (
          <Link
            key={child.href}
            href={child.href}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t(child.labelKey, lang)}
          </Link>
        );
      })}
    </nav>
  );
}

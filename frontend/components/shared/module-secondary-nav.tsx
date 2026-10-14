"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const scrollerRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 1);
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setCanScrollRight(remaining > 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateOverflow();
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateOverflow);
      observer.disconnect();
    };
  }, [updateOverflow, pathname, lang, navModule?.id]);

  if (!navModule || navModule.utility || navModule.children.length === 0) return null;

  const activeHref = longestMatchingHref(
    pathname,
    navModule.children.map((child) => child.href),
  );
  const arrowClass =
    "absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground";

  return (
    <div className="relative border-b bg-card">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Show previous links"
          onClick={() => scrollerRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
          className={cn("left-2 sm:left-4 lg:left-8", arrowClass)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <nav
        ref={scrollerRef}
        aria-label={t(navModule.labelKey, lang)}
        className="flex min-w-0 gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 lg:px-10 [&::-webkit-scrollbar]:hidden"
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
      {canScrollRight && (
        <button
          type="button"
          aria-label="Show more links"
          onClick={() => scrollerRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
          className={cn("right-2 sm:right-4 lg:right-8", arrowClass)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

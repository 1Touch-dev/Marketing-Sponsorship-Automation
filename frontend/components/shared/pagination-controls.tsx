import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-rendered Prev/Next pagination for the list pages that used to
 * render their entire result set into the DOM at once (found in the
 * 2026-09-23 UX audit: 537 companies, 540 pipeline leads, 135 proposals,
 * 169 campaigns all rendered in one page load — a full-page screenshot of
 * /companies timed out entirely, and /pipeline rendered as a single
 * 36,000px-tall document). Preserves every other query param (filters,
 * search, sort) when moving between pages.
 */
export function PaginationControls({
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  function hrefForPage(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t text-sm">
      <span className="text-muted-foreground text-xs">
        Showing {start}–{end} of {totalCount}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={hrefForPage(Math.max(1, page - 1))}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-accent"
          }`}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Link>
        <span className="px-2 text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Link
          href={hrefForPage(Math.min(totalPages, page + 1))}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-accent"
          }`}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

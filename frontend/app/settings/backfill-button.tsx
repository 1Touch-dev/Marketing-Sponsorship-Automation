"use client";

export function BackfillButton() {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      onClick={async () => {
        const r = await fetch("/api/proposals/backfill-deliverables?limit=10", { method: "POST" });
        const j = await r.json() as { processed?: number; total_needing_backfill?: number; remaining?: number };
        alert(
          r.ok
            ? `Processed ${j.processed ?? 0} proposals. Remaining: ${j.remaining ?? "?"}`
            : "Backfill failed — see console",
        );
      }}
    >
      Run backfill (10 proposals)
    </button>
  );
}

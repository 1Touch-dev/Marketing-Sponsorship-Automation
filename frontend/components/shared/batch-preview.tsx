"use client";

import { useEffect, useState } from "react";

type Limits = {
  max_review_batch: number;
  max_batch_cost_usd: number;
  per_item_estimates_usd: Record<string, number>;
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export function BatchPreview({
  kind,
  names,
  industryUnresolved = false,
  routeMax,
  onBlocked,
}: {
  kind: "campaign_generation" | "outreach_run";
  names: string[];
  industryUnresolved?: boolean;
  /** The run route refuses a larger selected set than this. */
  routeMax?: number;
  onBlocked: (blocked: boolean) => void;
}) {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/batch/limits")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Couldn't load batch limits.");
        if (!cancelled) setLimits(body as Limits);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load batch limits.");
      });
    return () => { cancelled = true; };
  }, []);

  const perItem = limits?.per_item_estimates_usd?.[kind] ?? 0;
  const count = names.length;
  const estimated = Math.round(count * perItem * 10_000) / 10_000;
  const overCount = !!limits && count > limits.max_review_batch;
  const overCost = !!limits && count > 0 && estimated > limits.max_batch_cost_usd;
  const overRoute = routeMax !== undefined && count > routeMax;
  const blocked = overCount || overCost || overRoute;
  const reason = overCount
    ? `Too many to review at once: ${count} items, and the limit is ${limits?.max_review_batch}. Send a smaller batch.`
    : overCost
      ? `Estimated cost ${money(estimated)} is above the batch ceiling of ${money(limits?.max_batch_cost_usd ?? 0)}.`
      : overRoute
        ? `This run accepts at most ${routeMax} companies. ${count} are selected.`
        : null;

  useEffect(() => {
    onBlocked(blocked);
  }, [blocked, onBlocked]);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {limits && (
        <p className="text-muted-foreground">
          A person reviews at most {limits.max_review_batch} items. The cost ceiling is {money(limits.max_batch_cost_usd)}. Each item is estimated at {money(perItem)}.
        </p>
      )}
      {industryUnresolved && (
        <p>No companies are selected. The server decides the exact set from the industry filter when the run starts.</p>
      )}
      {count > 0 && (
        <>
          <p className="font-medium">{count} {count === 1 ? "company" : "companies"} · estimated {money(estimated)}</p>
          <ul className="max-h-28 overflow-y-auto space-y-0.5">
            {names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
          </ul>
        </>
      )}
      {reason && <p role="alert" className="text-red-600">{reason}</p>}
    </div>
  );
}

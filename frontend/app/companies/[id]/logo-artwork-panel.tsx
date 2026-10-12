"use client";

import { useEffect, useState } from "react";

type StaleImage = {
  job_id: string;
  job_type: string | null;
  display_label: string | null;
  used_version: number;
};

type LogoStatus = {
  current_version: number | null;
  stale: StaleImage[];
  unknown: number;
};

export function LogoArtworkPanel({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<LogoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/companies/${companyId}/logo-versions`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof body.error === "string" ? body.error : "Couldn't load logo artwork.");
          return;
        }
        const images = body.images ?? {};
        setStatus({
          current_version: typeof images.current_version === "number" ? images.current_version : null,
          stale: Array.isArray(images.stale) ? images.stale : [],
          unknown: typeof images.unknown === "number" ? images.unknown : 0,
        });
      } catch {
        if (!cancelled) setError("Couldn't load logo artwork.");
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  async function copyVersions() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/logo-versions`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Logo versions could not be copied.");
        return;
      }
      const archived = typeof body.archived === "number" ? body.archived : 0;
      const failed = typeof body.failed === "number" ? body.failed : 0;
      setResult(`${archived} copied into storage${failed > 0 ? `, ${failed} failed` : ""}.`);
    } catch {
      setError("Logo versions could not be copied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">Artwork from the logo</h2>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {status && status.stale.length === 0 && (
        <p className="text-sm text-muted-foreground">There is no artwork from an older logo.</p>
      )}
      {status && status.stale.length > 0 && (
        <ul className="space-y-2">
          {status.stale.map((image) => (
            <li key={image.job_id} className="text-sm">
              <span className="font-medium">{image.display_label || "Untitled image"}</span>
              <span className="text-muted-foreground">
                {" · "}{image.job_type || "image"}
                {" · "}version {image.used_version}
                {status.current_version != null ? `, current version ${status.current_version}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {status && status.unknown > 0 && (
        <p className="text-sm text-muted-foreground">
          {status.unknown} image{status.unknown === 1 ? "" : "s"} made before logo versions were recorded.
        </p>
      )}
      <button
        type="button"
        onClick={copyVersions}
        disabled={busy}
        className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Copying…" : "Copy logo versions into storage"}
      </button>
      {result && <p className="text-sm text-muted-foreground">{result}</p>}
    </section>
  );
}

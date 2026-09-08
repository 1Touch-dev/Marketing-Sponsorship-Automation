"use client";
import { useEffect, useRef } from "react";

/**
 * Phase 5 — native engagement analytics (master_report.md Section 4 P0
 * item #3). Tracks time-on-page and max scroll depth per viewing session,
 * sent via navigator.sendBeacon on unload since fetch is unreliable there.
 */
export function ViewTracker({
  proposalId,
  token,
  variant = "A",
}: {
  proposalId: string;
  token: string;
  variant?: "A" | "B";
}) {
  const viewIdRef = useRef<string | null>(null);
  const maxScrollRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const sentRef = useRef(false);

  useEffect(() => {
    fetch(`/api/proposals/${proposalId}/track-view?token=${token}&variant=${variant}`, { method: "POST" })
      .then((r) => r.json())
      .then((j: { view_id?: string | null }) => {
        viewIdRef.current = j.view_id ?? null;
      })
      .catch(() => {});

    function onScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? Math.min(100, Math.round((window.scrollY / scrollable) * 100)) : 100;
      if (pct > maxScrollRef.current) maxScrollRef.current = pct;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    function sendFinalMetrics() {
      if (sentRef.current || !viewIdRef.current) return;
      sentRef.current = true;
      const payload = JSON.stringify({
        view_id: viewIdRef.current,
        time_on_page_seconds: (Date.now() - startedAtRef.current) / 1000,
        max_scroll_pct: maxScrollRef.current,
      });
      const url = `/api/proposals/${proposalId}/track-view`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", body: payload, keepalive: true }).catch(() => {});
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") sendFinalMetrics();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", sendFinalMetrics);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", sendFinalMetrics);
    };
  }, [proposalId, token, variant]);

  return null;
}

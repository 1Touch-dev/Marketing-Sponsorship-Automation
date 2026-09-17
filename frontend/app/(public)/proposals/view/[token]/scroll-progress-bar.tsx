"use client";

import { useEffect, useState } from "react";

/**
 * Thin scroll-linked progress bar, shown just below the sticky header on
 * the public proposal share page. Read-only visual affordance — helps a
 * sponsor gauge how much of the proposal is left, a pattern common on
 * DocSend-style document viewers (competitive research, 2026-09-16).
 */
export function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    function update() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, pct)));
    }
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="print:hidden sticky top-[52px] z-[59] h-[3px] w-full bg-slate-100">
      <div
        className="h-full bg-gradient-to-r from-green-600 to-emerald-500 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

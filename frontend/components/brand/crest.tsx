import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The official Coritiba Foot Ball Club crest. One file, used everywhere, so the
 * logo never drifts between the sign-in page, loading screens and the sidebar.
 */
export const CORITIBA_LOGO = "/brand/coritiba_logo.png";

// The artwork is portrait (the star sits above the badge): 1084 x 1379.
const LOGO_RATIO = 1084 / 1379;

/** The crest. `size` is the height in px; the width follows the artwork. */
export function Crest({
  size = 40,
  className,
  alt = "Coritiba Foot Ball Club",
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CORITIBA_LOGO}
      alt={alt}
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      draggable={false}
      className={cn("select-none object-contain", className)}
      style={{ height: size, width: "auto" }}
    />
  );
}

/**
 * Loading spinner built around the crest: a green ring runs around it while the
 * badge breathes. Honours "reduce motion". Use it for page and section loads;
 * keep the small inline spinner inside buttons.
 */
export function CrestSpinner({
  size = 56,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const ring = Math.round(size * 1.55);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("inline-flex flex-col items-center gap-3", className)}
    >
      <div className="relative flex items-center justify-center" style={{ width: ring, height: ring }}>
        <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary motion-safe:animate-spin" />
        <Crest size={size} className="motion-safe:animate-pulse" />
      </div>
      {label ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">Carregando / Loading</span>
      )}
    </div>
  );
}

/** Centred crest spinner for a whole page (loading.tsx files). */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center py-12">
      <CrestSpinner size={64} label={label ?? "Carregando… / Loading…"} />
    </div>
  );
}

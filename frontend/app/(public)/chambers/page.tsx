import type { Metadata } from "next";
import { NicheLandingPage } from "@/components/landing/niche-landing-page";

export const metadata: Metadata = {
  title: "Bundled Sponsorship Packages for Chambers",
  description: "Pitch your membership once a year, not quarterly — bundled annual sponsorship packages for business associations.",
};

export default function ChambersLanding() {
  return (
    <NicheLandingPage
      copy={{
        niche: "chambers",
        eyebrow: "For business associations & chambers",
        headline: "Stop asking your members one deal at a time.",
        body: [
          "Chronic under-staffing plus \"sponsor fatigue\" from constant one-off asks is the defining problem for business associations.",
          "Market Sponsorship Automation bundles annual sponsorship packages so you pitch once, not quarterly — and reach your entire membership through one relationship, not a hundred individual conversations.",
        ],
        proofPoint: "Chambers are the easiest segment to reach as a single addressable market — one relationship can convert an entire membership list.",
        accentClassName: "bg-amber-600",
        accentTextClassName: "text-amber-700",
      }}
    />
  );
}

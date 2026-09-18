import type { Metadata } from "next";
import { NicheLandingPage } from "@/components/landing/niche-landing-page";

export const metadata: Metadata = {
  title: "Sponsor & Exhibitor ROI for Conferences",
  description: "Give every sponsor and exhibitor a live, branded portal showing real exposure and engagement numbers.",
};

export default function ConferencesLanding() {
  return (
    <NicheLandingPage
      copy={{
        niche: "conferences",
        eyebrow: "For conferences & trade shows",
        headline: "Prove ROI to your sponsors before they ask.",
        body: [
          "Only 19% of advertisers are confident they can measure sponsorship ROI at all. If your renewal conversation starts with \"let me pull that together,\" you've already lost leverage.",
          "Market Sponsorship Automation gives every sponsor and exhibitor a live, branded portal showing real exposure and engagement numbers — so your renewal pitch is a formality, not a scramble.",
        ],
        proofPoint: "Clear ROI reporting drives 40–60% higher renewal rates industry-wide.",
        accentClassName: "bg-indigo-600",
        accentTextClassName: "text-indigo-700",
      }}
    />
  );
}

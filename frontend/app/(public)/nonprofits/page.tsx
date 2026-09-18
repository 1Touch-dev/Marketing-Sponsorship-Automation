import type { Metadata } from "next";
import { NicheLandingPage } from "@/components/landing/niche-landing-page";

export const metadata: Metadata = {
  title: "Sponsorship & Donor Tools for Nonprofits",
  description: "AI-assisted donor and sponsor tracking, grant-ready reporting, and no surprise export fees.",
};

export default function NonprofitsLanding() {
  return (
    <NicheLandingPage
      copy={{
        niche: "nonprofits",
        eyebrow: "For nonprofits & charities",
        headline: "You're not understaffed because you're bad at this. The tools are.",
        body: [
          "One person doing everything is the norm, not the exception, for nonprofit sponsorship and donor relations — and CRM/data problems are getting worse, not better: 33% of nonprofits now call it a top challenge, up from 15% two years ago.",
          "Market Sponsorship Automation replaces the spreadsheet-and-sticky-notes system with AI-assisted donor/sponsor tracking, grant-ready reporting, and proposals that don't need a designer.",
        ],
        proofPoint: "No $450 surprise export fee, ever.",
        accentClassName: "bg-rose-600",
        accentTextClassName: "text-rose-700",
      }}
    />
  );
}

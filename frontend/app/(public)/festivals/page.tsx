import type { Metadata } from "next";
import { NicheLandingPage } from "@/components/landing/niche-landing-page";

export const metadata: Metadata = {
  title: "Sponsorship Automation for Festivals & Events",
  description: "AI-drafted sponsor proposals and real-time exposure reporting for music festivals and event promoters.",
};

export default function FestivalsLanding() {
  return (
    <NicheLandingPage
      copy={{
        niche: "festivals",
        eyebrow: "For music festivals & event promoters",
        headline: "Sponsorship sales shouldn't run on the same spreadsheet as everything else.",
        body: [
          "Festival and event teams juggle sponsorship sales alongside a dozen other things, with no dedicated tooling for the sponsor relationship itself — proposals, ROI reporting, and renewal tracking end up scattered across email and spreadsheets.",
          "Market Sponsorship Automation gives you AI-drafted sponsor proposals and real-time exposure reporting, purpose-built for the event sponsorship relationship — not a generic sales CRM.",
        ],
        proofPoint: "Built on the same platform already running a professional football club's full sponsorship program.",
        accentClassName: "bg-fuchsia-600",
        accentTextClassName: "text-fuchsia-700",
      }}
    />
  );
}

import type { Metadata } from "next";
import { NicheLandingPage } from "@/components/landing/niche-landing-page";

export const metadata: Metadata = {
  title: "Sponsorship Automation for Sports Clubs",
  description: "AI-drafted proposals, real-time ROI dashboards, and one-click reporting for pro and amateur club sponsorship programs.",
};

export default function SportsClubsLanding() {
  return (
    <NicheLandingPage
      copy={{
        niche: "sports-clubs",
        eyebrow: "For pro & amateur sports clubs",
        headline: "Run your sponsorship program like it's worth millions — because it is.",
        body: [
          "Most sponsorship programs at pro and amateur clubs are run by a small generalist staff off Excel and WhatsApp, managing multi-million-dollar relationships with no dedicated tooling.",
          "Market Sponsorship Automation gives you AI-drafted proposals, a real-time sponsor ROI dashboard, and one-click reporting — no design team, no spreadsheet, no dropped follow-up.",
        ],
        proofPoint: "Built for clubs, proven in production — not a generic CRM bolted on afterward.",
        accentClassName: "bg-emerald-600",
        accentTextClassName: "text-emerald-700",
      }}
    />
  );
}

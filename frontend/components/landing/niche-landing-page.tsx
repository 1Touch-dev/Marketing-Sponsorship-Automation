import { LeadCaptureForm } from "./lead-capture-form";

export type NicheLandingCopy = {
  niche: string;
  eyebrow: string;
  headline: string;
  body: string[];
  proofPoint: string;
  accentClassName: string; // tailwind bg-* class for the CTA button + accent bar
  accentTextClassName: string; // tailwind text-* class for the eyebrow/accent text
};

export function NicheLandingPage({ copy }: { copy: NicheLandingCopy }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className={`h-1.5 w-full ${copy.accentClassName}`} />
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-5 gap-12">
        <div className="lg:col-span-3">
          <p className={`text-xs font-bold uppercase tracking-wider ${copy.accentTextClassName}`}>{copy.eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight text-slate-900">{copy.headline}</h1>
          <div className="mt-6 space-y-4 text-slate-600 leading-relaxed">
            {copy.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-8 rounded-lg border-l-4 border-slate-300 bg-slate-50 p-4 text-sm text-slate-700 italic">
            {copy.proofPoint}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-16">
            <LeadCaptureForm niche={copy.niche} accentClassName={copy.accentClassName} />
          </div>
        </div>
      </div>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        Market Sponsorship Automation
      </footer>
    </div>
  );
}

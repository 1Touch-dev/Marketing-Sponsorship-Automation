import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, Sparkles, Shirt, Monitor, Camera, Tv2, Plus, AlertCircle, Eye, CheckCircle, Clock } from "lucide-react";
import { MockupForm } from "./mockup-form";

export const dynamic = "force-dynamic";

const MOCKUP_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  jersey:          { label: "Jersey Mockup",       icon: <Shirt className="h-5 w-5" />,    description: "Sponsor logo on Coritiba FC official jersey" },
  led_board:       { label: "LED Board",            icon: <Monitor className="h-5 w-5" />,  description: "Sponsor on LED perimeter boards at Couto Pereira" },
  stadium_banner:  { label: "Stadium Banner",       icon: <Eye className="h-5 w-5" />,      description: "Large stadium banner with sponsor branding" },
  press_backdrop:  { label: "Press Backdrop",       icon: <Camera className="h-5 w-5" />,   description: "Sponsor logo on post-match interview backdrop" },
  scoreboard:      { label: "Scoreboard Ad",        icon: <Tv2 className="h-5 w-5" />,      description: "Sponsor displayed on giant scoreboard" },
  social_post:     { label: "Social Media Post",    icon: <ImageIcon className="h-5 w-5" />,    description: "Branded social media content for Coritiba channels" },
};

const PROVIDER_LABELS: Record<string, { label: string; status: string; color: string }> = {
  dalle3:     { label: "DALL-E 3",          status: "Configurable",     color: "blue" },
  stability:  { label: "Stability AI",      status: "Configurable",     color: "purple" },
  midjourney: { label: "Midjourney",        status: "Architecture Ready", color: "pink" },
  manual:     { label: "Manual Upload",     status: "Active",           color: "green" },
};

export default async function MediaPage() {
  const sb = supabaseAdmin();

  let mockups: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("visual_mockups" as "companies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      mockups = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  const pending = mockups.filter((m) => m.status === "pending");
  const generated = mockups.filter((m) => m.status === "generated" || m.status === "approved");

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Media & Mockups"
        description="Visual generation foundation for Coritiba FC sponsorship mockups"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">AI Generation: Architecture Ready</Badge>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Mockup
            </Button>
          </div>
        }
      />

      {migrationNeeded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Database Migration Required</p>
            <p className="text-sm text-amber-700 mt-1">
              Go to{" "}
              <a href="/coritiba-intelligence" className="underline font-medium">Coritiba Intelligence</a>{" "}
              to apply migrations.
            </p>
          </div>
        </div>
      )}

      {/* Architecture overview */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardContent className="pt-4">
          <p className="text-sm font-semibold text-purple-800 mb-3">AI Media Generation — Architecture</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(PROVIDER_LABELS).map(([key, cfg]) => (
              <div key={key} className={`rounded-lg border p-3 ${cfg.color === "green" ? "bg-green-50 border-green-200" : "bg-white"}`}>
                <p className="text-xs font-medium">{cfg.label}</p>
                <Badge variant="outline" className={`text-xs mt-1 ${cfg.color === "green" ? "text-green-700 border-green-300" : "text-muted-foreground"}`}>
                  {cfg.status}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-purple-700 mt-3">
            The visual mockup system stores prompts, placement coordinates, and approval workflows. Connect a provider API key (DALL-E, Stability AI) to enable automated generation.
            Manual upload is active — upload sponsor placements directly.
          </p>
        </CardContent>
      </Card>

      {/* Placement types */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sponsor Placement Templates</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(MOCKUP_TYPE_CONFIG).map(([type, cfg]) => (
            <Card key={type} className="hover:border-purple-300 transition-colors cursor-pointer group">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors">
                    {cfg.icon}
                  </div>
                  <p className="text-sm font-medium">{cfg.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{cfg.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 bg-blue-50 text-blue-700">
          <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1"><Clock className="h-4 w-4" />Pending</div>
          <p className="text-2xl font-bold">{pending.length}</p>
        </div>
        <div className="rounded-lg border p-3 bg-green-50 text-green-700">
          <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1"><CheckCircle className="h-4 w-4" />Generated</div>
          <p className="text-2xl font-bold">{generated.length}</p>
        </div>
        <div className="rounded-lg border p-3 bg-purple-50 text-purple-700">
          <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1"><Sparkles className="h-4 w-4" />Total</div>
          <p className="text-2xl font-bold">{mockups.length}</p>
        </div>
      </div>

      {/* Mockup list */}
      {mockups.length > 0 && (
        <div className="space-y-3">
          {mockups.map((m) => (
            <MockupCard key={m.id as string} mockup={m} />
          ))}
        </div>
      )}

      {/* Mockup prompt builder */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Create Mockup / Visual Brief
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MockupForm mockupTypes={MOCKUP_TYPE_CONFIG} />
          </CardContent>
        </Card>
      )}

      {/* Roadmap */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">Upcoming Visual AI Features</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span>DALL-E 3 / Stability AI integration — connect API key to generate jersey mockups</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-400" />
              <span>Logo overlay system — upload sponsor logo, auto-place on templates using stored coordinates</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-pink-400" />
              <span>Midjourney / Runway integration for video concept generation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span>Approval workflow for generated visuals before sharing with sponsors</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MockupCard({ mockup }: { mockup: Record<string, unknown> }) {
  const statusColors: Record<string, string> = {
    pending: "text-blue-700 bg-blue-50",
    generating: "text-amber-700 bg-amber-50",
    generated: "text-green-700 bg-green-50",
    approved: "text-green-800 bg-green-100",
    rejected: "text-red-700 bg-red-50",
  };
  const status = (mockup.status as string) || "pending";

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{mockup.name as string}</p>
              <Badge variant="outline" className="text-xs capitalize">{(mockup.mockup_type as string).replace("_", " ")}</Badge>
            </div>
            {!!mockup.ai_prompt && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mockup.ai_prompt as string}</p>
            )}
            {!!mockup.placement_zone && (
              <p className="text-xs text-muted-foreground mt-0.5">Placement: {(mockup.placement_zone as string).replace("_", " ")}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <Badge className={`text-xs ${statusColors[status] || ""}`} variant="outline">
              {status}
            </Badge>
            {!!mockup.ai_provider && (
              <p className="text-xs text-muted-foreground">{PROVIDER_LABELS[(mockup.ai_provider as string)]?.label || mockup.ai_provider as string}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

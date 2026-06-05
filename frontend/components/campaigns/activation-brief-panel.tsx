"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, FileText, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

type ActivationBrief = {
  generated_at?: string;
  company?: string;
  inventory_items?: Array<{ name: string; quantity: number }>;
  resource_requirements?: Array<{ role: string; hours: number }>;
  total_team_hours?: number;
  narrative?: string | null;
};

export function ActivationBriefPanel({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [brief, setBrief] = useState<ActivationBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function loadBrief() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/activation-brief`);
      const j = await res.json();
      if (res.ok) setBrief((j.brief as ActivationBrief) ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function generate(regenerate: boolean) {
    setGenerating(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/activation-brief`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Generation failed");
      setBrief(j.brief as ActivationBrief);
      toast({
        variant: "success",
        title: regenerate ? "Brief regenerated" : "Activation brief generated",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to generate brief",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Activation Brief
        </CardTitle>
        <CardDescription>
          Resource requirements, team hours, and AI narrative for executing this campaign.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => generate(!!brief)}
            disabled={generating || loading}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : brief ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {generating
              ? "Generating…"
              : brief
                ? "Regenerate Brief"
                : "Generate Activation Brief"}
          </Button>
        </div>

        {loading && !brief && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading brief…
          </p>
        )}

        {!loading && !brief && !generating && (
          <p className="text-sm text-muted-foreground">
            Click above to generate an AI activation brief for this campaign.
          </p>
        )}

        {brief && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4 text-sm">
            {brief.generated_at && (
              <p className="text-xs text-muted-foreground">
                Generated {new Date(brief.generated_at).toLocaleString("pt-BR")}
                {brief.company ? ` · ${brief.company}` : ""}
              </p>
            )}

            {typeof brief.total_team_hours === "number" && (
              <div>
                <p className="font-semibold text-foreground">Total team hours</p>
                <p className="text-2xl font-bold text-primary">{brief.total_team_hours}h</p>
              </div>
            )}

            {brief.resource_requirements && brief.resource_requirements.length > 0 && (
              <div>
                <p className="font-semibold mb-2">Resource requirements</p>
                <ul className="space-y-1">
                  {brief.resource_requirements.map((r, i) => (
                    <li key={i} className="flex justify-between gap-4 text-muted-foreground">
                      <span>{r.role}</span>
                      <span className="font-medium text-foreground">{r.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.inventory_items && brief.inventory_items.length > 0 && (
              <div>
                <p className="font-semibold mb-2">Inventory items</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {brief.inventory_items.map((item, i) => (
                    <li key={i}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.narrative && (
              <div>
                <p className="font-semibold mb-2">AI narrative</p>
                <div className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {brief.narrative}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

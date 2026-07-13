"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FlaskConical, X, Trophy, Eye, MousePointerClick, AlertCircle, CheckCircle2
} from "lucide-react";

type ABTestConfig = {
  element: "hero_text" | "cta_text" | "package_layout";
  variant_a: string;
  variant_b: string;
  created_at: string;
};

type ViewTrackingRow = {
  variant: string;
  views: number;
  cta_clicks: number;
};

const ELEMENT_LABELS: Record<string, string> = {
  hero_text: "Hero Text (main headline)",
  cta_text: "CTA Button Text",
  package_layout: "Package Layout (list vs cards)",
};

// Mock tracking data (in production, this would come from view_tracking table)
const MOCK_TRACKING: ViewTrackingRow[] = [
  { variant: "A", views: 24, cta_clicks: 4 },
  { variant: "B", views: 18, cta_clicks: 5 },
];

export function ABTestPanel({
  proposalId,
  initialConfig,
}: {
  proposalId: string;
  initialConfig: ABTestConfig | null;
}) {
  const [config, setConfig] = useState<ABTestConfig | null>(initialConfig);
  const [showModal, setShowModal] = useState(false);
  const [element, setElement] = useState<ABTestConfig["element"]>("hero_text");
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tracking = MOCK_TRACKING;

  const variantARate = tracking.find((t) => t.variant === "A");
  const variantBRate = tracking.find((t) => t.variant === "B");

  const aClickRate = variantARate && variantARate.views > 0
    ? Math.round((variantARate.cta_clicks / variantARate.views) * 100)
    : 0;
  const bClickRate = variantBRate && variantBRate.views > 0
    ? Math.round((variantBRate.cta_clicks / variantBRate.views) * 100)
    : 0;
  const winner = config
    ? aClickRate >= bClickRate ? "A" : "B"
    : null;

  async function saveABTest() {
    if (!variantA.trim() || !variantB.trim()) {
      setError("Both Variant A and Variant B are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newConfig: ABTestConfig = {
        element,
        variant_a: variantA.trim(),
        variant_b: variantB.trim(),
        created_at: new Date().toISOString(),
      };
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ab_test_config: newConfig }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Save failed");
      }
      setConfig(newConfig);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openModal() {
    if (config) {
      setElement(config.element);
      setVariantA(config.variant_a);
      setVariantB(config.variant_b);
    } else {
      setVariantA("");
      setVariantB("");
    }
    setError(null);
    setShowModal(true);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-indigo-500" /> A/B Test
          {config && (
            <Badge className="ml-auto text-xs bg-indigo-100 text-indigo-700 border-indigo-200">Active</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Test different elements of your proposal to maximise sponsor engagement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!config ? (
          <div className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50 p-4 text-center space-y-2">
            <FlaskConical className="h-6 w-6 text-indigo-400 mx-auto" />
            <p className="text-sm text-muted-foreground">No A/B test configured yet.</p>
            <Button size="sm" variant="outline" onClick={openModal} className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Create A/B Test
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Test configuration summary */}
            <div className="rounded-lg border p-3 bg-slate-50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Testing: {ELEMENT_LABELS[config.element]}</span>
                <button onClick={openModal} className="text-xs text-primary hover:underline">Edit</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2 bg-white">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Variant A (current)</p>
                  <p className="text-xs">{config.variant_a}</p>
                </div>
                <div className="rounded-md border p-2 bg-indigo-50 border-indigo-200">
                  <p className="text-[10px] font-semibold text-indigo-600 uppercase mb-1">Variant B</p>
                  <p className="text-xs">{config.variant_b}</p>
                </div>
              </div>
            </div>

            {/* Results table */}
            <div>
              <p className="text-xs font-semibold mb-2">Results</p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b">
                      <th className="text-left px-3 py-2 font-medium">Variant</th>
                      <th className="text-center px-3 py-2 font-medium flex items-center gap-1 justify-center">
                        <Eye className="h-3 w-3" /> Views
                      </th>
                      <th className="text-center px-3 py-2 font-medium">
                        <span className="flex items-center gap-1 justify-center"><MousePointerClick className="h-3 w-3" /> CTA Clicks</span>
                      </th>
                      <th className="text-center px-3 py-2 font-medium">Click Rate</th>
                      <th className="text-center px-3 py-2 font-medium">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { v: "A", data: variantARate, rate: aClickRate },
                      { v: "B", data: variantBRate, rate: bClickRate },
                    ].map(({ v, data, rate }) => (
                      <tr key={v} className={`border-b last:border-0 ${winner === v ? "bg-green-50" : ""}`}>
                        <td className="px-3 py-2 font-semibold">
                          Variant {v}
                          {v === "A" && <span className="ml-1 text-muted-foreground text-[10px]">(current)</span>}
                        </td>
                        <td className="px-3 py-2 text-center">{data?.views ?? 0}</td>
                        <td className="px-3 py-2 text-center">{data?.cta_clicks ?? 0}</td>
                        <td className="px-3 py-2 text-center font-bold">
                          {rate}%
                        </td>
                        <td className="px-3 py-2 text-center">
                          {winner === v ? (
                            <Trophy className="h-3.5 w-3.5 text-amber-500 mx-auto" />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {winner && (
                <div className={`mt-2 rounded-md px-3 py-2 flex items-center gap-2 text-xs font-medium ${
                  winner === "A" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                }`}>
                  <Trophy className="h-3.5 w-3.5" />
                  Variant {winner} is leading with a {winner === "A" ? aClickRate : bClickRate}% CTA click rate
                  {winner === "B" && bClickRate > aClickRate && (
                    <span className="ml-1 text-green-600">(+{bClickRate - aClickRate}% vs A)</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openModal} className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> Edit Test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={async () => {
                  if (!confirm("Remove A/B test configuration?")) return;
                  await fetch(`/api/proposals/${proposalId}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ab_test_config: null }),
                  });
                  setConfig(null);
                }}
              >
                Remove Test
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-indigo-500" /> Configure A/B Test
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Element to Test</Label>
              <select
                value={element}
                onChange={(e) => setElement(e.target.value as ABTestConfig["element"])}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
              >
                {Object.entries(ELEMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Variant A <span className="text-muted-foreground">(current version)</span>
              </Label>
              {element === "package_layout" ? (
                <select
                  value={variantA}
                  onChange={(e) => setVariantA(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="">Select layout</option>
                  <option value="list">List view</option>
                  <option value="cards">Card grid</option>
                </select>
              ) : (
                <Textarea
                  value={variantA}
                  onChange={(e) => setVariantA(e.target.value)}
                  rows={2}
                  placeholder="Current value for this element..."
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Variant B <span className="text-indigo-600">(alternative)</span></Label>
              {element === "package_layout" ? (
                <select
                  value={variantB}
                  onChange={(e) => setVariantB(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="">Select layout</option>
                  <option value="list">List view</option>
                  <option value="cards">Card grid</option>
                </select>
              ) : (
                <Textarea
                  value={variantB}
                  onChange={(e) => setVariantB(e.target.value)}
                  rows={2}
                  placeholder="Alternative version to test..."
                />
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={saveABTest} disabled={saving} className="flex-1 gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save A/B Test"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

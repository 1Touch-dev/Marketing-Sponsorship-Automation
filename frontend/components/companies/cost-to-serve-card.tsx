import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import type { CompanyCostToServe } from "@/lib/companies/cost-to-serve";

const CATEGORY_LABELS: Record<string, string> = {
  bedrock_text: "AI text generation (proposals, intelligence, outreach)",
  openai_image: "AI image generation (mockups)",
};

export function CostToServeCard({ data }: { data: CompanyCostToServe }) {
  if (!data.has_data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <DollarSign className="h-4 w-4" />
          AI Cost to Serve
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-semibold">${data.total_usd.toFixed(3)}</p>
          <p className="text-xs text-muted-foreground">{data.call_count} AI call{data.call_count === 1 ? "" : "s"} for this lead</p>
        </div>
        <div className="space-y-1.5">
          {data.by_category.map((c) => (
            <div key={c.category} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{CATEGORY_LABELS[c.category] ?? c.category}</span>
              <span className="font-medium">${c.usd.toFixed(3)} ({c.calls})</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/70 pt-1 border-t">
          Real per-call spend since AI cost tracking began 2026-09-15. Calls before this
          date aren&apos;t attributed here (not fabricated as zero-cost).
        </p>
      </CardContent>
    </Card>
  );
}

import { Badge } from "@/components/ui/badge";

const VARIANT_MAP: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline"> = {
  interested: "success",
  objection: "warning",
  not_interested: "destructive",
  needs_info: "info",
  out_of_office: "secondary",
  other: "outline",
};

const LABEL_MAP: Record<string, string> = {
  interested: "Interested",
  objection: "Objection",
  not_interested: "Not interested",
  needs_info: "Needs info",
  out_of_office: "Out of office",
  other: "Other",
};

/** Phase 2 — reply classification badge, see lib/emails/reply-classifier.ts */
export function ReplyClassificationBadge({ classification }: { classification: string | null }) {
  if (!classification) return null;
  return (
    <Badge variant={VARIANT_MAP[classification] ?? "outline"}>
      {LABEL_MAP[classification] ?? classification.replace(/_/g, " ")}
    </Badge>
  );
}

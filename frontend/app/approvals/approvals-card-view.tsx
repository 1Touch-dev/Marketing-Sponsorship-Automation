"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Check, X, Pencil, ChevronLeft, ChevronRight } from "lucide-react";

export type ApprovalItem = {
  id: string;
  type: "proposal" | "campaign" | "email";
  title: string;
  company: string;
  status: string;
  preview?: string;
  editUrl: string;
};

type Props = {
  items: ApprovalItem[];
};

export function ApprovalsCardView({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const currentItem = items[currentIndex] ?? null;
  const reviewedCount = reviewed.size;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleAction = useCallback(
    async (action: "approved" | "rejected") => {
      if (!currentItem || loading) return;
      setLoading(true);

      const apiMap: Record<ApprovalItem["type"], string> = {
        proposal: `/api/proposals/${currentItem.id}/status`,
        campaign: `/api/campaigns/${currentItem.id}/status`,
        email: `/api/emails/${currentItem.id}/status`,
      };

      try {
        const res = await fetch(apiMap[currentItem.type], {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });

        if (res.ok) {
          setReviewed((prev) => new Set(prev).add(currentItem.id));
          if (currentIndex < items.length - 1) {
            goNext();
          }
        }
      } catch {
        // silently fail - user can retry
      } finally {
        setLoading(false);
      }
    },
    [currentItem, currentIndex, items.length, goNext, loading],
  );

  const handleEdit = useCallback(() => {
    if (!currentItem) return;
    window.open(currentItem.editUrl, "_blank");
  }, [currentItem]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhum item para revisar.
      </div>
    );
  }

  const typeLabel: Record<ApprovalItem["type"], string> = {
    proposal: "Proposta",
    campaign: "Campanha",
    email: "Email",
  };

  const typeBadgeVariant: Record<ApprovalItem["type"], "default" | "info" | "warning"> = {
    proposal: "default",
    campaign: "warning",
    email: "info",
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-medium">
          {reviewedCount} / {items.length} revisado{items.length !== 1 ? "s" : ""}
        </span>
        <div className="w-48 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(reviewedCount / items.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" onClick={goPrev} disabled={currentIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>{currentIndex + 1} / {items.length}</span>
        <Button variant="ghost" size="icon" onClick={goNext} disabled={currentIndex === items.length - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Main card */}
      {currentItem && (
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={typeBadgeVariant[currentItem.type]}>
                  {typeLabel[currentItem.type]}
                </Badge>
                <StatusBadge status={currentItem.status} />
                {reviewed.has(currentItem.id) && (
                  <Badge variant="success">Revisado</Badge>
                )}
              </div>
            </div>
            <CardTitle className="mt-2">{currentItem.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{currentItem.company}</p>
          </CardHeader>

          {currentItem.preview && (
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {currentItem.preview}
              </p>
            </CardContent>
          )}

          <CardFooter className="flex justify-center gap-4 pt-4 pb-6">
            <Button
              variant="destructive"
              size="lg"
              onClick={() => handleAction("rejected")}
              disabled={loading}
              className="min-w-[120px]"
            >
              <X className="h-4 w-4 mr-2" />
              Rejeitar
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleEdit}
              className="min-w-[120px] border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button
              size="lg"
              onClick={() => handleAction("approved")}
              disabled={loading}
              className="min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-4 w-4 mr-2" />
              Aprovar
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Keyboard shortcuts hint */}
      <p className="text-xs text-muted-foreground">
        Use ← → para navegar entre os cards
      </p>
    </div>
  );
}

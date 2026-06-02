"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { Search } from "lucide-react";

interface Company {
  id: string;
  company_name: string;
}

export function CampaignGenerator({
  companies,
  preselectedCompanyId,
}: {
  companies: Company[];
  preselectedCompanyId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState(preselectedCompanyId || "");
  const [searchQ, setSearchQ] = useState("");
  const [objective, setObjective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return companies.slice(0, 20);
    const q = searchQ.toLowerCase();
    return companies.filter((c) => c.company_name.toLowerCase().includes(q)).slice(0, 20);
  }, [companies, searchQ]);

  const selectedName = companies.find((c) => c.id === companyId)?.company_name ?? "";

  function selectCompany(c: Company) {
    setCompanyId(c.id);
    setSearchQ(c.company_name);
    setShowDropdown(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      toast({ variant: "destructive", title: "Select a company first." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, objective: objective || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      toast({
        variant: "success",
        title: "Campaign ideas generated",
        description: `${j.data?.length ?? 0} ideas saved.${j.attempts > 1 ? ` (${j.attempts} attempts)` : ""}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5 relative">
        <Label htmlFor="company-search">Company *</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            id="company-search"
            placeholder={companies.length === 0 ? "No companies — add one first" : "Search company…"}
            value={searchQ || (companyId ? selectedName : "")}
            onChange={(e) => {
              setSearchQ(e.target.value);
              if (!e.target.value) setCompanyId("");
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            className="pl-8"
          />
        </div>
        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto mt-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                onMouseDown={() => selectCompany(c)}
              >
                {c.company_name}
              </button>
            ))}
          </div>
        )}
        {companyId && (
          <p className="text-xs text-green-700 font-medium">✓ {selectedName}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="objective">Objective / context</Label>
        <Textarea
          id="objective"
          rows={3}
          placeholder="e.g. Drive brand awareness during Q3 with sports activation."
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting || !companyId} className="w-full">
        {submitting ? "Generating ideas…" : "Generate ideas"}
      </Button>
      <p className="text-xs text-muted-foreground">Uses AWS Bedrock — Claude Sonnet.</p>
    </form>
  );
}

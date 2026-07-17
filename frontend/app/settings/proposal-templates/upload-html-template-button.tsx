"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { UploadCloud, Loader2, FileCode } from "lucide-react";

export function UploadHtmlTemplateButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function submit() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Template name required" });
      return;
    }
    if (!file) {
      toast({ variant: "destructive", title: "Choose an .html file" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      if (industry.trim()) fd.append("industry", industry.trim());

      const res = await fetch("/api/proposal-templates/upload-html", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Upload failed", description: json.error });
        return;
      }
      const placeholderCount = (json.data?.placeholder_config ?? []).length;
      toast({
        variant: "success",
        title: "Template uploaded",
        description: `Found ${placeholderCount} placeholder${placeholderCount === 1 ? "" : "s"} — configure them next.`,
      });
      setOpen(false);
      setName("");
      setIndustry("");
      setFile(null);
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UploadCloud className="h-3.5 w-3.5" /> Upload HTML template
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 max-w-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileCode className="h-4 w-4 text-primary" /> Upload HTML presentation template
      </div>
      <p className="text-xs text-muted-foreground">
        Use <code className="bg-muted px-1 rounded">[[TOKEN]]</code> for text (e.g.{" "}
        <code className="bg-muted px-1 rounded">[[COMPANY_NAME]]</code>) and{" "}
        <code className="bg-muted px-1 rounded">[[IMG:KEY]]</code> for images (e.g.{" "}
        <code className="bg-muted px-1 rounded">[[IMG:JERSEY_CHEST]]</code>) inside your HTML file.
      </p>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Bebidas Sponsorship Deck" />
      </div>
      <div className="space-y-1.5">
        <Label>Industry (optional)</Label>
        <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="ex: Bebidas" />
      </div>
      <div className="space-y-1.5">
        <Label>HTML file</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs w-full rounded-md border bg-background px-3 py-2"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={submit} disabled={uploading} className="gap-1.5">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Upload & scan placeholders"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

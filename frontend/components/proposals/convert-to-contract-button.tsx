"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileCheck, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";

export function ConvertToContractButton({ proposalId, proposalTitle, companyId }: {
  proposalId: string;
  proposalTitle: string;
  companyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contractNumber: `CTR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    totalValue: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    dealType: "sponsorship" as string,
  });
  const router = useRouter();
  const { toast } = useToast();

  async function handleConvert() {
    setSaving(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          company_id: companyId,
          contract_number: form.contractNumber,
          title: proposalTitle,
          total_value_brl: form.totalValue ? parseFloat(form.totalValue) : null,
          start_date: form.startDate,
          end_date: form.endDate,
          deal_type: form.dealType,
          status: "active",
        }),
      });
      if (res.ok) {
        toast({ title: "✓ Contract created" });
        setOpen(false);
        router.push("/contracts");
      } else {
        const d = await res.json();
        toast({ variant: "destructive", title: d.error ?? "Failed to create contract" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-green-300 text-green-700 hover:bg-green-50">
        <FileCheck className="h-4 w-4 mr-1" />
        Convert to Contract
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Create Contract</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Contract Number</label>
                <input className="w-full border rounded-md px-3 py-2 text-sm" value={form.contractNumber} onChange={e => setForm(f => ({...f, contractNumber: e.target.value}))} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Total Value (R$)</label>
                <input type="number" className="w-full border rounded-md px-3 py-2 text-sm" value={form.totalValue} onChange={e => setForm(f => ({...f, totalValue: e.target.value}))} placeholder="e.g. 200000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Date</label>
                  <input type="date" className="w-full border rounded-md px-3 py-2 text-sm" value={form.startDate} onChange={e => setForm(f => ({...f, startDate: e.target.value}))} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Date</label>
                  <input type="date" className="w-full border rounded-md px-3 py-2 text-sm" value={form.endDate} onChange={e => setForm(f => ({...f, endDate: e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Deal Type</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.dealType} onChange={e => setForm(f => ({...f, dealType: e.target.value}))}>
                  <option value="sponsorship">Patrocínio</option>
                  <option value="barter">Permuta / Barter</option>
                  <option value="lei_de_incentivo">Lei de Incentivo</option>
                  <option value="media">Mídia</option>
                  <option value="naming_rights">Naming Rights</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleConvert} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileCheck className="h-4 w-4 mr-1" />}
                Create Contract
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

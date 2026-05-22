import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import { InventoryManager } from "./inventory-manager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const sb = supabaseAdmin();

  let items: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("inventory_items" as "companies")
      .select("*")
      .eq("status", "active")
      .order("sort_order");

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      items = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sponsorship Inventory"
        description="Manage all Coritiba FC physical and digital sponsorship assets"
        actions={
          // Button is now inside InventoryManager — this is a visual placeholder
          <Button size="sm" id="inventory-add-btn" disabled className="gap-1.5 opacity-0 pointer-events-none">
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        }
      />

      {migrationNeeded ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Database Migration Required</p>
            <p className="text-sm text-amber-700 mt-1">
              The inventory tables need to be created. Go to{" "}
              <a href="/coritiba-intelligence" className="underline font-medium">Coritiba Intelligence</a>{" "}
              and click &quot;Apply Migrations&quot; to set up the database.
            </p>
          </div>
        </div>
      ) : (
        <InventoryManager initialItems={items} />
      )}
    </div>
  );
}

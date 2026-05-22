import { supabaseAdmin } from "@/lib/supabase/server";
import UsersManager from "./users-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const sb = supabaseAdmin();
  const { data: users } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .order("created_at" as "id", { ascending: true });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team & Roles</h1>
        <p className="text-muted-foreground mt-1">
          Invite teammates and control what each person can do on the platform.
        </p>
      </div>

      {/* Roles reference card */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <h2 className="text-sm font-semibold mb-3">Role Permissions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1.5 pr-4 font-medium w-48">Permission</th>
                <th className="text-center py-1.5 px-3 font-medium">Admin</th>
                <th className="text-center py-1.5 px-3 font-medium">Sales Rep</th>
                <th className="text-center py-1.5 px-3 font-medium">Approver</th>
                <th className="text-center py-1.5 px-3 font-medium">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.label} className="hover:bg-muted/20">
                  <td className="py-1.5 pr-4 text-muted-foreground">{row.label}</td>
                  {(["admin", "sales_rep", "approver", "viewer"] as const).map((role) => (
                    <td key={role} className="text-center py-1.5 px-3">
                      {row.roles.includes(role) ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UsersManager initialUsers={(users ?? []) as unknown as import("@/lib/auth/roles").PlatformUser[]} />
    </div>
  );
}

const PERMISSION_ROWS = [
  { label: "View dashboard & proposals",    roles: ["admin", "sales_rep", "approver", "viewer"] },
  { label: "Add & edit companies",          roles: ["admin", "sales_rep"] },
  { label: "Run AI intelligence",           roles: ["admin", "sales_rep"] },
  { label: "Create campaigns",              roles: ["admin", "sales_rep"] },
  { label: "Generate proposals",            roles: ["admin", "sales_rep"] },
  { label: "Edit proposal content (CMS)",   roles: ["admin", "sales_rep"] },
  { label: "Submit proposal for review",    roles: ["admin", "sales_rep"] },
  { label: "Approve or reject proposals",   roles: ["admin", "approver"] },
  { label: "Send proposal to prospect",     roles: ["admin", "approver"] },
  { label: "Generate AI images & mockups",  roles: ["admin", "sales_rep"] },
  { label: "Manage Pipedrive sync",         roles: ["admin"] },
  { label: "Invite & manage users",         roles: ["admin"] },
];

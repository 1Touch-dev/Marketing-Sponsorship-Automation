import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

export function PortalShell({
  clubName,
  crestUrl,
  companyName,
  children,
}: {
  clubName: string;
  crestUrl: string | null;
  companyName?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {crestUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crestUrl} alt={clubName} className="h-8 w-8 object-contain" />
            )}
            <div>
              <div className="text-sm font-bold text-slate-800">Portal do Patrocinador</div>
              {companyName && <div className="text-xs text-slate-400">{companyName}</div>}
            </div>
          </div>
          <form action="/api/portal/logout" method="POST">
            <button type="submit" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {children}
      </div>
    </div>
  );
}

import { CheckCircle, AlertCircle, XCircle, PlugZap } from "lucide-react";
import type { Connection } from "@/lib/integrations/health";

/**
 * The connection banner every screen shows for an outside system. It is drawn from the one connection record
 * (lib/integrations/health.ts), so no screen can be green while a push is failing.
 */
const TONES = {
  ok: { box: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800", head: "text-green-700 dark:text-green-300", body: "text-green-600 dark:text-green-400", Icon: CheckCircle, icon: "text-green-600" },
  warn: { box: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800", head: "text-amber-700 dark:text-amber-300", body: "text-amber-600 dark:text-amber-400", Icon: AlertCircle, icon: "text-amber-600" },
  bad: { box: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800", head: "text-red-700 dark:text-red-300", body: "text-red-600 dark:text-red-400", Icon: XCircle, icon: "text-red-600" },
  idle: { box: "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700", head: "text-slate-700 dark:text-slate-300", body: "text-slate-600 dark:text-slate-400", Icon: PlugZap, icon: "text-slate-500" },
} as const;

export function ConnectionBanner({ connection, className = "" }: { connection: Pick<Connection, "state" | "tone" | "label" | "detail">; className?: string }) {
  const t = TONES[connection.tone];
  return (
    <div role="status" data-connection-state={connection.state} className={`rounded-xl border p-4 flex items-start gap-3 ${t.box} ${className}`}>
      <t.Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${t.icon}`} />
      <div className="flex-1">
        <div className={`font-semibold text-sm ${t.head}`}>{connection.label}</div>
        <div className={`text-xs mt-0.5 ${t.body}`}>{connection.detail}</div>
      </div>
    </div>
  );
}

import { connectionOf, keyCheckIsStale, loadHealth, recordKeyCheck, type Connection } from "../integrations/health";
import { checkPipedriveKey, isPipedriveConfigured } from "./client";
import { SYSTEM } from "./adapter";

type Sb = any;

/**
 * The one answer to "is Pipedrive connected?" that /crm-sync, /pipeline, /system and the health endpoints all show.
 *
 * `check` asks Pipedrive whether it accepts the key, at most once every five minutes (or right now with `force`), so a
 * screen can say something true even before any push has happened. Without `check` it only reads what is recorded, which
 * is what a plain page load should do.
 */
export async function pipedriveConnection(sb: Sb, tenantId: string, opts: { check?: boolean; force?: boolean } = {}): Promise<Connection> {
  const configured = isPipedriveConfigured();
  let health = await loadHealth(sb, tenantId, SYSTEM, configured);
  if (configured && (opts.check || opts.force) && (opts.force || keyCheckIsStale(health))) {
    // short and without retries: this runs while a page loads
    const r = await checkPipedriveKey({ timeoutMs: 4000, retries: 0 });
    await recordKeyCheck(sb, tenantId, SYSTEM, r);
    health = await loadHealth(sb, tenantId, SYSTEM, configured);
  }
  return connectionOf(health, "Pipedrive");
}

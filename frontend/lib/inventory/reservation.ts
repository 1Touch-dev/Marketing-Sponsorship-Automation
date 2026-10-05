import { effectiveAvailability, resolveUnit, type InventoryLike } from "./availability";

export type InventoryRow = InventoryLike & { id: string; quantity_sold?: number | null };

/**
 * Storage seam. casSold must be atomic: it applies `next` only if the stored
 * quantity_sold still equals `expected`, and reports whether it applied.
 */
export interface InventoryStore {
  getRow(id: string): Promise<InventoryRow | null>;
  casSold(id: string, expected: number | null, next: number): Promise<boolean>;
}

export type Line = { inventory_id: string; quantity: number };

export type Conflict = {
  inventory_id: string;
  name: string;
  requested: number;
  remaining: number;
  reason: string;
};

/**
 * Only whole-season and monthly assets are physical, single-supply rights.
 * Per-match and per-deliverable units (posts, videos, ...) carry the schema
 * default total_quantity of 1 without meaning it, so they are not enforced.
 */
export function isCapacityLimited(row: InventoryLike): boolean {
  const unit = resolveUnit(row).unit;
  return unit === "per_season" || unit === "per_month";
}

const MAX_ATTEMPTS = 6;

function mergeLines(lines: Line[]): Line[] {
  const byId = new Map<string, number>();
  for (const l of lines) {
    const q = Math.max(1, Math.floor(Number(l.quantity) || 1));
    byId.set(l.inventory_id, (byId.get(l.inventory_id) ?? 0) + q);
  }
  return [...byId].map(([inventory_id, quantity]) => ({ inventory_id, quantity }));
}

type CommitOutcome =
  | { ok: true; committed: Line[] }
  | { ok: false; conflict: Conflict; rolledBack: Line[] };

export async function commitLines(store: InventoryStore, lines: Line[]): Promise<CommitOutcome> {
  const committed: Line[] = [];

  for (const line of mergeLines(lines)) {
    let done = false;
    let skipped = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done && !skipped; attempt++) {
      const row = await store.getRow(line.inventory_id);
      if (!row) {
        const rolledBack = await releaseLines(store, committed);
        return {
          ok: false,
          rolledBack,
          conflict: { inventory_id: line.inventory_id, name: line.inventory_id, requested: line.quantity, remaining: 0, reason: "Inventory item not found" },
        };
      }
      if (!isCapacityLimited(row)) { skipped = true; break; }

      const eff = effectiveAvailability(row);
      if (eff.remaining < line.quantity) {
        const rolledBack = await releaseLines(store, committed);
        return {
          ok: false,
          rolledBack,
          conflict: {
            inventory_id: line.inventory_id,
            name: row.name ?? line.inventory_id,
            requested: line.quantity,
            remaining: eff.remaining,
            reason: eff.state === "sold_out" ? eff.reason : `Only ${eff.remaining} unit(s) remaining`,
          },
        };
      }

      const current = row.quantity_sold ?? null;
      if (await store.casSold(line.inventory_id, current, (current ?? 0) + line.quantity)) {
        committed.push(line);
        done = true;
      }
    }

    if (!done && !skipped) {
      const rolledBack = await releaseLines(store, committed);
      return {
        ok: false,
        rolledBack,
        conflict: { inventory_id: line.inventory_id, name: line.inventory_id, requested: line.quantity, remaining: 0, reason: "Inventory is being updated by someone else, try again" },
      };
    }
  }

  return { ok: true, committed };
}

export async function releaseLines(store: InventoryStore, lines: Line[]): Promise<Line[]> {
  const released: Line[] = [];
  for (const line of mergeLines(lines)) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await store.getRow(line.inventory_id);
      if (!row || !isCapacityLimited(row)) break;
      const current = row.quantity_sold ?? null;
      const next = Math.max(0, (current ?? 0) - line.quantity);
      if (await store.casSold(line.inventory_id, current, next)) {
        released.push(line);
        break;
      }
    }
  }
  return released;
}

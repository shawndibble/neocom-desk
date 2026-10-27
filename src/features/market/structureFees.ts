/**
 * The broker fee a structure's owner charges, as the pilot typed it — Editable
 * Data, so it syncs (issue #2911). ESI exposes no structure fee schedule, and
 * skills and standings do not reduce it, so it can only be entered. One blob
 * for every structure for the same reason `features/pi/customsOverride.ts`
 * gives: `mergeSettings` is whole-value last-write-wins per key and the
 * allow-list is exact-match. Clearing a structure empties an entry; the key is
 * never deleted.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { MAX_STRUCTURE_OWNER_PCT } from '@/engine/market/structureFee';

export const SYNCED_STRUCTURE_FEES_KEY = 'sync.structureBrokerFees';

/** Structure id to the OWNER's broker fee, percent (2.0 = 2%); excludes the 0.5% SCC surcharge. */
export type StructureFees = Record<number, number>;

function usablePct(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_STRUCTURE_OWNER_PCT
  );
}

/** The stored blob, validated entry by entry: it may come from another build or a hand edit. */
export function parseStructureFees(raw: unknown): StructureFees {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: StructureFees = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const structureId = Number(key);
    if (!Number.isInteger(structureId) || structureId <= 0) continue;
    if (!usablePct(value)) continue;
    out[structureId] = value;
  }
  return out;
}

/** The fees with one structure set. A non-numeric rate is refused, not clamped to a free structure. */
export function withStructureFee(
  fees: StructureFees,
  structureId: number,
  ownerPct: number
): StructureFees {
  if (!Number.isFinite(ownerPct)) return fees;
  return { ...fees, [structureId]: Math.min(MAX_STRUCTURE_OWNER_PCT, Math.max(0, ownerPct)) };
}

export function withoutStructureFee(fees: StructureFees, structureId: number): StructureFees {
  if (fees[structureId] === undefined) return fees;
  const next = { ...fees };
  delete next[structureId];
  return next;
}

export const useStructureFees = createSyncedSetting<StructureFees>({
  key: SYNCED_STRUCTURE_FEES_KEY,
  defaultValue: {},
  parse: parseStructureFees,
});

import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { MAX_STRUCTURE_OWNER_PCT } from '@/engine/market/structureFee';

export const SYNCED_STRUCTURE_FEES_KEY = 'sync.structureBrokerFees';

export type StructureFees = Record<number, number>;

function usablePct(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_STRUCTURE_OWNER_PCT
  );
}

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

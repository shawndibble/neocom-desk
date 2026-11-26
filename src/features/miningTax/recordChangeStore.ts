import { db, type MiningTaxRecordChangeRecord } from '@/db';
import type {
  OwnedRecordChange,
  RecordChange,
  ToleranceCloseOut,
} from '@/engine/miningTax/recordChanges';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import { pullCursorKey } from '@/sync/localBookkeeping';
import { MINING_TAX_RECORD_CHANGES } from '@/sync/syncedCollections';

export function recordChangeOf(r: MiningTaxRecordChangeRecord): RecordChange | null {
  const base = {
    id: r.id,
    at: r.at,
    date: r.date,
    ...(r.corporationId !== undefined ? { corporationId: r.corporationId } : {}),
    ...(r.minerId !== undefined ? { minerId: r.minerId } : {}),
  };
  if (r.reason === 'tolerance') {
    const closeOut: ToleranceCloseOut | undefined = r.closeOut;
    if (!closeOut || r.corporationId === undefined || r.minerId === undefined) return null;
    return {
      ...base,
      reason: 'tolerance',
      corporationId: r.corporationId,
      minerId: r.minerId,
      closeOut,
    };
  }
  return { ...base, reason: r.reason, assignments: r.assignments ?? [] };
}

function recordOf(
  { characterId, change }: OwnedRecordChange,
  updatedAt: number
): MiningTaxRecordChangeRecord {
  return {
    id: change.id,
    characterId,
    reason: change.reason,
    at: change.at,
    date: change.date,
    ...(change.corporationId !== undefined ? { corporationId: change.corporationId } : {}),
    ...(change.minerId !== undefined ? { minerId: change.minerId } : {}),
    ...(change.reason === 'tolerance'
      ? { closeOut: change.closeOut }
      : { assignments: change.assignments }),
    updatedAt,
  };
}

export async function loadRecordChanges(): Promise<RecordChange[]> {
  const records = await db.miningTaxRecordChanges.toArray();
  return records
    .flatMap((r) => recordChangeOf(r) ?? [])
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function recordChangesReady(characterIds: readonly number[]): Promise<boolean> {
  if (!isSyncConfigured()) return true;
  const cursors = await db.settings.bulkGet(
    characterIds.map((id) => pullCursorKey(id, MINING_TAX_RECORD_CHANGES.remoteName))
  );
  return cursors.every((c) => c !== undefined);
}

export async function saveRecordChanges(
  changes: readonly OwnedRecordChange[]
): Promise<RecordChange[]> {
  if (changes.length === 0) return [];
  const now = Date.now();
  const added = await db.transaction('rw', db.miningTaxRecordChanges, async () => {
    const stored = new Set(
      (await db.miningTaxRecordChanges.bulkGet(changes.map((c) => c.change.id)))
        .filter((r) => r !== undefined)
        .map((r) => r.id)
    );
    const fresh = changes.filter((c) => {
      if (stored.has(c.change.id)) return false;
      stored.add(c.change.id);
      return true;
    });
    await db.miningTaxRecordChanges.bulkAdd(fresh.map((c) => recordOf(c, now)));
    return fresh;
  });
  for (const characterId of new Set(added.map((c) => c.characterId)))
    scheduleSync(characterId, { collections: ['miningTaxRecordChanges'] });
  return added.map((c) => c.change);
}

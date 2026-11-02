/**
 * A Character's typed-in cerebral accelerator (GLOSSARY.md **Accelerator**),
 * stored in Dexie (`characterAccelerators`) and synced. One row per Character;
 * a plan and the Characters table both read and write it here, so the two can
 * never disagree.
 *
 * Deleting goes through a tombstone so the removal syncs instead of the next
 * pull resurrecting the row.
 */
import { db, type CharacterAcceleratorRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { CHARACTER_ACCELERATORS } from '@/sync/syncedCollections';
import { isAcceleratorLive } from '@/engine/accelerator';
import { clampBoosterBonus } from '@/features/skills/planner/planBooster';

export function acceleratorId(characterId: number): string {
  return String(characterId);
}

/** Saves the accelerator running on `characterId`, replacing any earlier one. */
export async function setCharacterAccelerator(
  characterId: number,
  bonus: number,
  expiresAt: number,
  nowMs: number = Date.now()
): Promise<void> {
  const record: CharacterAcceleratorRecord = {
    id: acceleratorId(characterId),
    characterId,
    bonus: clampBoosterBonus(bonus),
    expiresAt,
    updatedAt: nowMs,
  };
  await db.characterAccelerators.put(record);
  scheduleSync(characterId, { collections: ['characterAccelerators'] });
}

async function removeRecord(characterId: number): Promise<void> {
  await db.characterAccelerators.delete(acceleratorId(characterId));
  await appendTombstones(tombstoneKey(CHARACTER_ACCELERATORS, characterId), [
    acceleratorId(characterId),
  ]);
}

/** `removeRecord` in one transaction, so a crash cannot leave the row gone and the removal unsynced. */
function removeRecordAtomically(
  characterId: number,
  onlyIf?: (row: CharacterAcceleratorRecord) => boolean
) {
  return db.transaction('rw', db.characterAccelerators, db.settings, async () => {
    const row = await db.characterAccelerators.get(acceleratorId(characterId));
    if (!row || (onlyIf && !onlyIf(row))) return false;
    await removeRecord(characterId);
    return true;
  });
}

/** Forgets the typed-in accelerator, so detection from the attribute sheet applies again. */
export async function clearCharacterAccelerator(characterId: number): Promise<void> {
  if (await removeRecordAtomically(characterId)) {
    scheduleSync(characterId, { collections: ['characterAccelerators'] });
  }
}

/** Deletes every accelerator that has run out, returning the Characters it touched. */
export async function purgeExpiredAccelerators(nowMs: number = Date.now()): Promise<number[]> {
  const expired = (await db.characterAccelerators.toArray()).filter(
    (record) => !isAcceleratorLive(record, nowMs)
  );
  const purged: number[] = [];
  for (const record of expired) {
    // Re-checked inside the transaction: the pilot may have just saved a new expiry.
    const removed = await removeRecordAtomically(
      record.characterId,
      (row) => !isAcceleratorLive(row, nowMs)
    );
    if (!removed) continue;
    purged.push(record.characterId);
    scheduleSync(record.characterId, { collections: ['characterAccelerators'] });
  }
  return purged;
}

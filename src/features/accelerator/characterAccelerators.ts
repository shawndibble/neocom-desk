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

/** Forgets the typed-in accelerator, so detection from the attribute sheet applies again. */
export async function clearCharacterAccelerator(characterId: number): Promise<void> {
  if ((await db.characterAccelerators.get(acceleratorId(characterId))) === undefined) return;
  await removeRecord(characterId);
  scheduleSync(characterId, { collections: ['characterAccelerators'] });
}

/** Deletes every accelerator that has run out, returning the Characters it touched. */
export async function purgeExpiredAccelerators(nowMs: number = Date.now()): Promise<number[]> {
  const expired = (await db.characterAccelerators.toArray()).filter(
    (record) => !isAcceleratorLive(record, nowMs)
  );
  for (const record of expired) {
    await removeRecord(record.characterId);
    scheduleSync(record.characterId, { collections: ['characterAccelerators'] });
  }
  return expired.map((record) => record.characterId);
}

import { db, type CharacterAcceleratorRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { appendTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { CHARACTER_ACCELERATORS } from '@/sync/syncedCollections';
import { isAcceleratorLive } from '@/engine/accelerator';
import { clampBoosterBonus } from '@/features/skills/planner/planBooster';
import type { AttributeBaseline } from '@/engine/attributeBaseline';

export function acceleratorId(characterId: number): string {
  return String(characterId);
}

export function injectedAccelerator(
  stored: CharacterAcceleratorRecord | null | undefined,
  baseline: AttributeBaseline | null | undefined,
  nowMs: number
): { running: CharacterAcceleratorRecord | null; detected: number | null } {
  return {
    running: stored && isAcceleratorLive(stored, nowMs) ? stored : null,
    detected: baseline?.kind === 'accelerated' ? baseline.acceleratorBonus : null,
  };
}

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

export async function clearCharacterAccelerator(characterId: number): Promise<void> {
  if (await removeRecordAtomically(characterId)) {
    scheduleSync(characterId, { collections: ['characterAccelerators'] });
  }
}

export async function purgeExpiredAccelerators(nowMs: number = Date.now()): Promise<number[]> {
  const expired = (await db.characterAccelerators.toArray()).filter(
    (record) => !isAcceleratorLive(record, nowMs)
  );
  const purged: number[] = [];
  for (const record of expired) {
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

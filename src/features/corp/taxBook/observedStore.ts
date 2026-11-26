import { db } from '@/db';
import type { CorpBookObservedMetaRecord, CorpBookObservedRecord } from '@/db';
import type { ObservedCopyMeta, StoredObserved } from './observedDelta';

let wipeEpoch = 0;
export const currentWipeEpoch = () => wipeEpoch;

const tables = () => [db.corpBookObserved, db.corpBookObservedMeta, db.corpBookParts];

export async function readObservedCopy(
  characterId: number,
  corporationId: number
): Promise<{ meta: ObservedCopyMeta; rows: StoredObserved<unknown>[] } | undefined> {
  const meta = await db.corpBookObservedMeta.get([characterId, corporationId]);
  if (!meta) return undefined;
  const rows = await db.corpBookObserved
    .where('[characterId+corporationId]')
    .equals([characterId, corporationId])
    .toArray();
  return {
    meta: {
      version: meta.version,
      checkedAt: meta.checkedAt,
      fullAt: meta.fullAt,
      watermark: meta.watermark,
      ...(meta.bookCreatedAt !== undefined ? { bookCreatedAt: meta.bookCreatedAt } : {}),
    },
    rows: rows.map((r) => ({ id: r.id, row: r.row, updatedMs: r.updatedMs })),
  };
}

const metaRecord = (
  characterId: number,
  corporationId: number,
  meta: ObservedCopyMeta
): CorpBookObservedMetaRecord => ({ characterId, corporationId, ...meta });

export async function saveObservedCopy(
  characterId: number,
  corporationId: number,
  rows: readonly StoredObserved<unknown>[],
  meta: ObservedCopyMeta,
  replace: boolean
): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    await dropOtherBooks(characterId, corporationId);
    if (replace) {
      await db.corpBookObserved
        .where('[characterId+corporationId]')
        .equals([characterId, corporationId])
        .delete();
    }
    const records: CorpBookObservedRecord[] = rows.map((r) => ({
      characterId,
      corporationId,
      id: r.id,
      row: r.row,
      updatedMs: r.updatedMs,
    }));
    await db.corpBookObserved.bulkPut(records);
    await db.corpBookObservedMeta.put(metaRecord(characterId, corporationId, meta));
  });
}

export async function dropOtherBooks(characterId: number, corporationId: number): Promise<void> {
  const held = [
    ...(await db.corpBookObservedMeta.toCollection().primaryKeys()),
    ...(await db.corpBookParts.toCollection().primaryKeys()).filter(
      ([, , slot]) => !slot.startsWith('member:')
    ),
  ];
  const others = new Map(
    held
      .filter(([c, corp]) => c !== characterId || corp !== corporationId)
      .map(([c, corp]) => [`${c}:${corp}`, [c, corp] as const] as const)
  );
  for (const [c, corp] of others.values()) await forgetBook(c, corp);
}

async function forgetBook(characterId: number, corporationId: number): Promise<void> {
  await db.corpBookObserved
    .where('[characterId+corporationId]')
    .equals([characterId, corporationId])
    .delete();
  await db.corpBookObservedMeta.delete([characterId, corporationId]);
  await db.corpBookParts
    .where('[characterId+corporationId]')
    .equals([characterId, corporationId])
    .delete();
}

export function forgetObservedCopy(characterId: number, corporationId: number): Promise<void> {
  wipeEpoch++;
  return db.transaction('rw', tables(), () => forgetBook(characterId, corporationId));
}

export async function clearObservedCopies(characterId: number): Promise<void> {
  wipeEpoch++;
  await db.corpBookObserved.where('characterId').equals(characterId).delete();
  await db.corpBookObservedMeta.where('characterId').equals(characterId).delete();
  await db.corpBookParts.where('characterId').equals(characterId).delete();
}

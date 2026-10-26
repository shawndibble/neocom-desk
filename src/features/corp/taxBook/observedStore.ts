/**
 * This device's Dexie copy of an officer's Corp Tax Book `observed` rows
 * (ADR 0031), and of the book's other parts (`corpBookParts`, bookPartStore.ts),
 * which share every wipe below. Officer-only data at rest, so: keyed by Character + corporation,
 * one book at a time (opening another drops the rest), and forgotten the moment
 * the officer check or the rules refuse and on Character removal.
 */
import { db } from '@/db';
import type { CorpBookObservedMetaRecord, CorpBookObservedRecord } from '@/db';
import type { ObservedCopyMeta, StoredObserved } from './observedDelta';

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
    },
    rows: rows.map((r) => ({ id: r.id, row: r.row, updatedMs: r.updatedMs })),
  };
}

const metaRecord = (
  characterId: number,
  corporationId: number,
  meta: ObservedCopyMeta
): CorpBookObservedMetaRecord => ({ characterId, corporationId, ...meta });

/**
 * Keeps the copy: `replace` swaps every row (a full read), otherwise `rows`
 * join or overwrite what is held (a delta). Any other book's copy is dropped,
 * in the same transaction.
 */
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

/** Drops every copy but this book's (a Character or corporation switch). */
export async function dropOtherBooks(characterId: number, corporationId: number): Promise<void> {
  const held = [
    ...(await db.corpBookObservedMeta.toArray()),
    ...(await db.corpBookParts.toArray()),
  ];
  const others = new Map(
    held
      .filter((m) => m.characterId !== characterId || m.corporationId !== corporationId)
      .map((m) => [`${m.characterId}:${m.corporationId}`, m] as const)
  );
  for (const m of others.values()) await forgetBook(m.characterId, m.corporationId);
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

/** Drops this Character's copy of one book, every part of it (the officer check or the rules refused). */
export function forgetObservedCopy(characterId: number, corporationId: number): Promise<void> {
  return db.transaction('rw', tables(), () => forgetBook(characterId, corporationId));
}

/** Drops every copy this Character holds. Call inside a transaction that includes these tables. */
export async function clearObservedCopies(characterId: number): Promise<void> {
  await db.corpBookObserved.where('characterId').equals(characterId).delete();
  await db.corpBookObservedMeta.where('characterId').equals(characterId).delete();
  await db.corpBookParts.where('characterId').equals(characterId).delete();
}

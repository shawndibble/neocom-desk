import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore/lite';
import type { Firestore } from 'firebase/firestore/lite';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { readObservedRow } from '@/engine/corpTaxBook/observed';
import { OBSERVED_UPDATED_AT_FIELD } from '../../../../functions/src/corpTaxBookVersionKeys';
import {
  applyObservedDelta,
  millisOf,
  planObservedRead,
  type ObservedCopyMeta,
  type StoredObserved,
} from './observedDelta';
import {
  dropOtherBooks,
  forgetObservedCopy,
  readObservedCopy,
  saveObservedCopy,
} from './observedStore';

const isDenied = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code ?? '').endsWith('permission-denied');

const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

function toStored(docs: { id: string; data: () => unknown }[]): StoredObserved<unknown>[] {
  return docs.map((d) => {
    const { [OBSERVED_UPDATED_AT_FIELD]: stamp, ...row } = d.data() as Record<string, unknown>;
    return { id: d.id, row, updatedMs: millisOf(stamp) };
  });
}

const rowsOf = (held: readonly StoredObserved<unknown>[]): ObservedRow[] =>
  held.flatMap((r) => readObservedRow(r.row as Record<string, unknown>) ?? []);

export async function readObservedRows(
  db: Firestore,
  characterId: number,
  corporationId: number,
  version: string | undefined,
  gate: Promise<unknown>,
  now = Date.now(),
  bookCreatedAt?: number
): Promise<ObservedRow[]> {
  const forgetOnDenied = async (error: unknown): Promise<never> => {
    if (isDenied(error)) await quietly(() => forgetObservedCopy(characterId, corporationId));
    throw error;
  };
  try {
    await gate;
  } catch (error) {
    return forgetOnDenied(error);
  }
  const col = collection(db, 'corps', String(corporationId), 'observed');
  await quietly(() => dropOtherBooks(characterId, corporationId));
  const held = await quietly(() => readObservedCopy(characterId, corporationId));
  const plan = planObservedRead(held?.meta, version, now, bookCreatedAt);

  if (plan.kind === 'cached' && held) return rowsOf(held.rows);

  let rows: StoredObserved<unknown>[];
  let meta: ObservedCopyMeta;
  try {
    if (plan.kind === 'delta' && held) {
      const delta = toStored(
        (
          await getDocs(
            query(col, where(OBSERVED_UPDATED_AT_FIELD, '>=', Timestamp.fromMillis(plan.since)))
          )
        ).docs
      );
      const merged = applyObservedDelta(held.rows, delta, held.meta.watermark);
      rows = merged.rows;
      meta = { ...held.meta, version, checkedAt: now, watermark: merged.watermark };
      await quietly(() => saveObservedCopy(characterId, corporationId, delta, meta, false));
    } else {
      rows = toStored((await getDocs(col)).docs);
      meta = {
        version,
        checkedAt: now,
        fullAt: now,
        watermark: applyObservedDelta([], rows, null).watermark,
        ...(bookCreatedAt !== undefined ? { bookCreatedAt } : {}),
      };
      await quietly(() => saveObservedCopy(characterId, corporationId, rows, meta, true));
    }
  } catch (error) {
    return forgetOnDenied(error);
  }
  return rowsOf(rows);
}

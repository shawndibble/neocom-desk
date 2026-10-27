/**
 * Reads an officer's `observed` rows through this device's Dexie copy
 * (ADR 0031): nothing when the collection's stamp is unchanged, the rows
 * written since the watermark otherwise, the whole collection when no copy
 * can be trusted. The rules check (`gate`) settles before any copy is handed
 * out, and a refusal wipes the copy.
 */
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore/lite';
import type { Firestore } from 'firebase/firestore/lite';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
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

/** Dexie being unavailable (private window, blocked) costs the copy, never the read. */
const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

function toStored(docs: { id: string; data: () => unknown }[]): StoredObserved<ObservedRow>[] {
  return docs.map((d) => {
    const { [OBSERVED_UPDATED_AT_FIELD]: stamp, ...row } = d.data() as Record<string, unknown>;
    return { id: d.id, row: row as unknown as ObservedRow, updatedMs: millisOf(stamp) };
  });
}

export async function readObservedRows(
  db: Firestore,
  characterId: number,
  corporationId: number,
  version: string | undefined,
  /** The officer-only probe: its failure means the rules refuse this Character. */
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

  if (plan.kind === 'cached' && held) return held.rows.map((r) => r.row as ObservedRow);

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
  return rows.map((r) => r.row as ObservedRow);
}

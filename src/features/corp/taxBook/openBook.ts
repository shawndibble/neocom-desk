/**
 * Opens a Corp Tax Book for reading under the officer rules (ADR 0023): the book's own
 * readers (`bookRead/`) and the sync's (`bookClient.ts`) share it, so they share one copy.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { bookVersionsOf, cachedPart } from './bookCache';
import { bookPartStore } from './bookPartStore';
import { readObservedRows } from './observedRead';
import { forgetObservedCopy } from './observedStore';

/**
 * Opens a book for reading: its settings document (always read: it carries
 * the version marker), and readers for its parts that reuse this tab's copy
 * while the part's stamp is unchanged (bookCache.ts, issue #5047).
 */
export async function openBook(characterId: number, corporationId: number) {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const snap = await getDoc(doc(db, 'corps', String(corporationId)));
  if (!snap.exists()) {
    // A deleted book takes its rows with it; a re-created one must not inherit ghosts.
    await forgetObservedCopy(characterId, corporationId).catch(() => {});
    return null;
  }
  const data = snap.data();
  const versions = bookVersionsOf(data);
  const key = `${characterId}:${corporationId}`;
  // `meta/paid` is read fresh every time, never from the copy: it is
  // officer-only, so the rules still decide each open. Every part waits on it,
  // so no copy is handed out to a Character the rules now refuse.
  const paid = getDoc(doc(db, 'corps', String(corporationId), 'meta', 'paid'));
  // A refusal here means the rules no longer let this Character in: nothing of the book stays on the device.
  paid.catch(async (error) => {
    if (errorCode(error).endsWith('permission-denied'))
      await forgetObservedCopy(characterId, corporationId).catch(() => {});
  });
  const store = bookPartStore(characterId, corporationId);
  /** Each Miner's stored paid-through day (`meta/paid.minerPaidThrough`): forward-only (D22). */
  const minerPaidThrough = async () =>
    new Map(
      Object.entries(
        ((await paid).data()?.minerPaidThrough as Record<string, string> | undefined) ?? {}
      )
    );
  const part = async <T>(
    collectionName: string,
    readPart: () => Promise<T>,
    slot?: string,
    persist = true
  ) => {
    const [, value] = await Promise.all([
      paid,
      cachedPart(key, collectionName, versions, readPart, {
        ...(slot ? { slot } : {}),
        ...(persist ? { store } : {}),
      }),
    ]);
    return value;
  };
  const read = async <T>(name: string): Promise<T[]> =>
    (await getDocs(collection(db, 'corps', String(corporationId), name))).docs.map(
      (d) => d.data() as T
    );
  const list = <T>(name: string): Promise<T[]> => part(name, () => read<T>(name));
  // `observed` is the book's biggest part: a delta over this device's Dexie copy (observedRead.ts).
  const observed = (): Promise<ObservedRow[]> =>
    part(
      'observed',
      () =>
        readObservedRows(
          db,
          characterId,
          corporationId,
          versions?.collections.observed,
          paid,
          Date.now(),
          typeof data.createdAt === 'number' ? data.createdAt : undefined
        ),
      undefined,
      false // its own Dexie copy (ADR 0031)
    );
  // A collection the stamps never name was never written (every server write stamps it): no read.
  const written = (name: string) => versions === null || versions.collections[name] !== undefined;
  return {
    db,
    corporationId,
    data,
    part,
    read,
    list,
    observed,
    minerPaidThrough,
    written,
  };
}

/** A Firestore error's code (`permission-denied`, `failed-precondition`, ...); '' when it has none. */
export const errorCode = (error: unknown): string =>
  String((error as { code?: unknown } | null)?.code ?? '');

/** An open book; null from `openBook` is a corporation with none. */
export type OpenBook = NonNullable<Awaited<ReturnType<typeof openBook>>>;

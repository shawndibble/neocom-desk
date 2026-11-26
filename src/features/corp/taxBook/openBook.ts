import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { bookVersionsOf, cachedPart } from './bookCache';
import { bookPartStore } from './bookPartStore';
import { readObservedRows } from './observedRead';
import { forgetObservedCopy } from './observedStore';

export async function openBook(characterId: number, corporationId: number) {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const snap = await getDoc(doc(db, 'corps', String(corporationId)));
  if (!snap.exists()) {
    await forgetObservedCopy(characterId, corporationId).catch(() => {});
    return null;
  }
  const data = snap.data();
  const versions = bookVersionsOf(data);
  const key = `${characterId}:${corporationId}`;
  const paid = getDoc(doc(db, 'corps', String(corporationId), 'meta', 'paid'));
  paid.catch(async (error) => {
    if (errorCode(error).endsWith('permission-denied'))
      await forgetObservedCopy(characterId, corporationId).catch(() => {});
  });
  const store = bookPartStore(characterId, corporationId);
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
      false
    );
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

export const errorCode = (error: unknown): string =>
  String((error as { code?: unknown } | null)?.code ?? '');

export type OpenBook = NonNullable<Awaited<ReturnType<typeof openBook>>>;

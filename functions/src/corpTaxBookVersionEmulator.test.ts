// The Corp Tax Book's version marker (issue #5047) against the Firestore emulator.
// Runs only under `npm run test:rules` at the repo root; a plain `npm test` skips it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { VERSIONED_COLLECTIONS } from './corpTaxBookVersionKeys.js';
import {
  installBookWriteTracking,
  stampBook,
  withBookVersions,
} from './corpTaxBookVersionTracking.js';

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;
const BOOK = '98500001';

let db: Firestore;
const book = () => db.collection('corps').doc(BOOK);
const versions = async () => {
  const d = (await book().get()).data() ?? {};
  return {
    bookVersion: d.bookVersion as string | undefined,
    collections: (d.collectionVersions ?? {}) as Record<string, string>,
  };
};
const versioned = <T>(run: () => Promise<T>) =>
  withBookVersions((id, touched) => stampBook(db, id, touched), run, vi.fn());

suite('Corp Tax Book version marker (emulator)', () => {
  beforeEach(async () => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
    db = getFirestore();
    installBookWriteTracking();
    await db.recursiveDelete(book());
  });

  it('leaves a book that does not exist alone', async () => {
    await stampBook(db, BOOK, new Set(['miners']));
    expect((await book().get()).exists).toBe(false);
  });

  it('stamps every versioned subcollection the first time, then only what was written', async () => {
    await book().set({ active: true });
    await versioned(() => book().collection('miners').doc('m1').set({ id: 'm1' }));
    const first = await versions();
    expect(first.bookVersion).toEqual(expect.any(String));
    expect(Object.keys(first.collections).sort()).toEqual([...VERSIONED_COLLECTIONS].sort());

    await versioned(() =>
      db.runTransaction(async (tx) => {
        await tx.get(book());
        tx.set(book().collection('statements').doc('s1'), { id: 's1' });
      })
    );
    const second = await versions();
    expect(second.bookVersion).not.toBe(first.bookVersion);
    for (const name of VERSIONED_COLLECTIONS) {
      if (name === 'statements') expect(second.collections[name]).not.toBe(first.collections[name]);
      else expect(second.collections[name]).toBe(first.collections[name]);
    }
  });

  it('stamps the book after a recursive delete of a subcollection doc and its children', async () => {
    await book().set({ active: true });
    const feeder = book().collection('feeders').doc('9');
    await feeder.set({ status: 'active' });
    await feeder.collection('payouts').doc('p1').set({ amount: 1 });
    await versioned(async () => undefined); // nothing written: nothing stamped
    expect((await versions()).bookVersion).toBeUndefined();

    await versioned(() => db.recursiveDelete(feeder));
    expect((await versions()).collections.feeders).toEqual(expect.any(String));
  });

  it('does not recreate a book its own scope deleted', async () => {
    await book().set({ active: true });
    await book().collection('miners').doc('m1').set({ id: 'm1' });
    await versioned(() => db.recursiveDelete(book()));
    expect((await book().get()).exists).toBe(false);
  });
});

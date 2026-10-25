import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Smoke coverage for the existing per-character sync rules: proves the
// harness loads firestore.rules and enforces the ownerHash guard.
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'characters/char:1/plans/p1'), {
      ownerHash: 'hash-a',
      name: 'plan',
    });
  });
});

describe('characters/{uid}/plans', () => {
  it('lets the owner with a matching ownerHash read and write', async () => {
    const db = characterAuth(env, 1, 'hash-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'characters/char:1/plans/p1')));
    await assertSucceeds(
      setDoc(doc(db, 'characters/char:1/plans/p2'), { ownerHash: 'hash-a', name: 'two' })
    );
  });

  it('denies another character', async () => {
    const db = characterAuth(env, 2, 'hash-b').firestore();
    await assertFails(getDoc(doc(db, 'characters/char:1/plans/p1')));
  });

  it('denies unauthenticated reads', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'characters/char:1/plans/p1')));
  });

  it('hides a doc from a new owner (stale ownerHash) on get but not list', async () => {
    const db = characterAuth(env, 1, 'hash-new').firestore();
    await assertFails(getDoc(doc(db, 'characters/char:1/plans/p1')));
    await assertSucceeds(
      getDocs(
        query(collection(db, 'characters/char:1/plans'), where('ownerHash', '==', 'hash-new'))
      )
    );
  });

  it('denies writes stamped with someone else’s ownerHash', async () => {
    const db = characterAuth(env, 1, 'hash-a').firestore();
    await assertFails(
      setDoc(doc(db, 'characters/char:1/plans/p3'), { ownerHash: 'forged', name: 'x' })
    );
  });
});

// Issue #5073: the change marker is `syncVersion` on the parent doc, beside the
// `lastSyncedAt` heartbeat. Owner-only, a whole number, nothing else on the doc.
describe('characters/{uid} change marker', () => {
  const owner = () => characterAuth(env, 1, 'hash-a').firestore();
  const parent = (db: ReturnType<typeof owner>, uid = 'char:1') => doc(db, `characters/${uid}`);

  it('lets the owner create the marker alone and read it back', async () => {
    await assertSucceeds(setDoc(parent(owner()), { syncVersion: increment(0) }, { merge: true }));
    await assertSucceeds(getDoc(parent(owner())));
  });

  it('lets the owner bump it beside the heartbeat, in either order', async () => {
    await assertSucceeds(setDoc(parent(owner()), { lastSyncedAt: 5 }, { merge: true }));
    await assertSucceeds(setDoc(parent(owner()), { syncVersion: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(parent(owner()), { lastSyncedAt: 6 }, { merge: true }));
  });

  it('refuses a marker that is not a whole number', async () => {
    await assertFails(setDoc(parent(owner()), { syncVersion: 'later' }, { merge: true }));
    await assertFails(setDoc(parent(owner()), { syncVersion: 1.5 }, { merge: true }));
  });

  it('refuses any other field on the parent doc', async () => {
    await assertFails(setDoc(parent(owner()), { syncVersion: 1, extra: true }, { merge: true }));
  });

  it("refuses another uid's marker, read or write", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'characters/char:2'), { syncVersion: 3 });
    });
    await assertFails(getDoc(parent(owner(), 'char:2')));
    await assertFails(setDoc(parent(owner(), 'char:2'), { syncVersion: 4 }, { merge: true }));
  });

  it('refuses an anonymous read or write', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(parent(anon)));
    await assertFails(setDoc(parent(anon), { syncVersion: 1 }, { merge: true }));
  });
});

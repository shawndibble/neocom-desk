import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
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

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Collector books (issue #4517): the sync writes a pointer per Character listing the
// books that bill them. Only that Character reads it; nobody writes it from a client.
let env: RulesTestEnvironment;
const MINER = 5;
const OFFICER = 1;
const POINTER = `corpTaxBookBilledBy/char:${MINER}`;

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, POINTER), { books: { '98000001': 1 } });
    await setDoc(doc(db, `corps/98000001/officers/char:${OFFICER}`), {
      ownerHash: 'h',
      corporationId: 98000001,
      canView: true,
      expiresAt: Date.now() + 3_600_000,
    });
  });
});

describe('corpTaxBookBilledBy', () => {
  it('lets the Character read their own pointer', async () => {
    await assertSucceeds(getDoc(doc(characterAuth(env, MINER, 'h').firestore(), POINTER)));
  });

  it.each([
    ['an officer of the book', () => characterAuth(env, OFFICER, 'h').firestore()],
    ['another character', () => characterAuth(env, 2, 'h').firestore()],
    ['an unauthenticated client', () => env.unauthenticatedContext().firestore()],
  ])('denies %s reading it', async (_n, ctx) => {
    await assertFails(getDoc(doc(ctx(), POINTER)));
  });

  it('denies listing the collection, even to the Character', async () => {
    await assertFails(
      getDocs(collection(characterAuth(env, MINER, 'h').firestore(), 'corpTaxBookBilledBy'))
    );
  });

  it('denies every client write, even the Character', async () => {
    const db = characterAuth(env, MINER, 'h').firestore();
    await assertFails(setDoc(doc(db, POINTER), { books: {} }));
    await assertFails(setDoc(doc(db, 'corpTaxBookBilledBy/char:6'), { books: {} }));
    await assertFails(deleteDoc(doc(db, POINTER)));
  });
});

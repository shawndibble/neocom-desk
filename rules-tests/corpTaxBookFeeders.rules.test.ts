import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Collector books (issue #4507): a client never writes a feeder record, an invite
// or a feeder pointer. An officer may read the feeder records; nobody reads the other two.
let env: RulesTestEnvironment;
const OFFICER = 1;
const RECORD = 'corpTaxBooks/98000001/feeders/98000002';
const PAYOUT = `${RECORD}/payouts/p1`;
const INVITE = 'corpTaxBookFeederInvites/abc';
const POINTER = 'corpTaxBookFeederOf/98000002';

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
    await setDoc(doc(db, RECORD), { status: 'active' });
    await setDoc(doc(db, PAYOUT), { amount: 1 });
    await setDoc(doc(db, INVITE), { collectorCorporationId: 98000001 });
    await setDoc(doc(db, POINTER), { collectorCorporationId: 98000001 });
    await setDoc(doc(db, `corpTaxBooks/98000001/officers/char:${OFFICER}`), {
      ownerHash: 'h',
      corporationId: 98000001,
      canView: true,
      expiresAt: Date.now() + 3_600_000,
    });
  });
});

const clients = [
  ['an officer', (e: RulesTestEnvironment) => characterAuth(e, OFFICER, 'h').firestore()],
  ['another character', (e: RulesTestEnvironment) => characterAuth(e, 2, 'h').firestore()],
  [
    'an unauthenticated client',
    (e: RulesTestEnvironment) => e.unauthenticatedContext().firestore(),
  ],
] as const;

describe('feeder paths', () => {
  it.each(clients)('denies %s every write to all three paths', async (_n, ctx) => {
    const db = ctx(env);
    for (const path of [RECORD, INVITE, POINTER]) {
      await assertFails(setDoc(doc(db, path), { status: 'x' }));
      await assertFails(setDoc(doc(db, path.replace(/[^/]+$/, 'new')), { status: 'x' }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });

  it.each(clients)('denies %s reading an invite or a pointer', async (_n, ctx) => {
    const db = ctx(env);
    await assertFails(getDoc(doc(db, INVITE)));
    await assertFails(getDoc(doc(db, POINTER)));
  });

  it('lets an officer read a feeder record, and nobody else', async () => {
    await assertSucceeds(getDoc(doc(characterAuth(env, OFFICER, 'h').firestore(), RECORD)));
    await assertFails(getDoc(doc(characterAuth(env, 2, 'h').firestore(), RECORD)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), RECORD)));
  });

  it.each(clients)('denies %s every write to a payout', async (_n, ctx) => {
    const db = ctx(env);
    await assertFails(setDoc(doc(db, PAYOUT), { amount: 2 }));
    await assertFails(setDoc(doc(db, `${RECORD}/payouts/new`), { amount: 2 }));
    await assertFails(deleteDoc(doc(db, PAYOUT)));
  });

  it('lets an officer read a payout, and nobody else', async () => {
    await assertSucceeds(getDoc(doc(characterAuth(env, OFFICER, 'h').firestore(), PAYOUT)));
    await assertFails(getDoc(doc(characterAuth(env, 2, 'h').firestore(), PAYOUT)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), PAYOUT)));
  });
});

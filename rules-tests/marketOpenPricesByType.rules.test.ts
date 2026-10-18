import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Open prices, one doc per type (decisions 20261018-121126, 20261018-164126):
// public read, admin-only write; the old per-region collection and the meta doc
// match no rule.
let env: RulesTestEnvironment;
const PATH = 'marketOpenPricesByType/34';

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), PATH), {
      typeId: 34,
      dates: ['2026-10-17'],
      regions: { 10000002: { buy: [5], sell: [6] } },
    });
  });
});

describe('marketOpenPricesByType rules', () => {
  it.each([
    [
      'an unauthenticated client',
      (e: RulesTestEnvironment) => e.unauthenticatedContext().firestore(),
    ],
    ['a signed-in character', (e: RulesTestEnvironment) => characterAuth(e, 1, 'h').firestore()],
  ])('lets %s read but not write or delete', async (_n, ctx) => {
    const db = ctx(env);
    await assertSucceeds(getDoc(doc(db, PATH)));
    await assertFails(setDoc(doc(db, PATH), { dates: [] }));
    await assertFails(setDoc(doc(db, 'marketOpenPricesByType/35'), { dates: [] }));
    await assertFails(deleteDoc(doc(db, PATH)));
  });
  it('no longer serves the old per-region collection, and keeps the meta doc admin-only', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'marketOpenPrices/10000002_34')));
    await assertFails(getDoc(doc(db, 'marketOpenPricesMeta/lastRun')));
  });
});

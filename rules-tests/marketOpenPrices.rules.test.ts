import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Open prices (decision 20261018-121126): public read, admin-only write.
let env: RulesTestEnvironment;
const PATH = 'marketOpenPrices/10000002_34';

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
      regionId: 10000002,
      typeId: 34,
      dates: ['2026-10-17'],
      buy: [5],
      sell: [6],
    });
  });
});

describe('marketOpenPrices rules', () => {
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
    await assertFails(setDoc(doc(db, 'marketOpenPrices/10000002_35'), { dates: [] }));
    await assertFails(deleteDoc(doc(db, PATH)));
  });
});

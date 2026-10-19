import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Corp Tax Book sync grant (issue #4068, ADR 0025): function-only. Not even the holding
// Character may read or write its doc; the encrypted token never reaches a client.
let env: RulesTestEnvironment;
const PATH = 'corpTaxBookSyncGrants/98000001';

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
      encryptedRefreshToken: 'v1.x.y.z',
      characterId: 1,
    });
  });
});

describe('corpTaxBookSyncGrants rules', () => {
  it.each([
    ['the owner', (e: RulesTestEnvironment) => characterAuth(e, 1, 'h').firestore()],
    ['another character', (e: RulesTestEnvironment) => characterAuth(e, 2, 'h').firestore()],
    [
      'an unauthenticated client',
      (e: RulesTestEnvironment) => e.unauthenticatedContext().firestore(),
    ],
  ])('denies %s read, create, update and delete', async (_n, ctx) => {
    const db = ctx(env);
    await assertFails(getDoc(doc(db, PATH)));
    await assertFails(setDoc(doc(db, PATH), { characterId: 1 }));
    await assertFails(setDoc(doc(db, 'corpTaxBookSyncGrants/98000002'), { characterId: 1 }));
    await assertFails(deleteDoc(doc(db, PATH)));
  });
});

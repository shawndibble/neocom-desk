import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Alerts Grant (issue #3753, ADR 0020): function-only. Not even the owning
// Character may read or write its doc; the encrypted token never reaches a client.
let env: RulesTestEnvironment;
const PATH = 'alertGrants/1';

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
      status: 'active',
    });
  });
});

describe('alertGrants rules', () => {
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
    await assertFails(setDoc(doc(db, PATH), { status: 'active' }));
    await assertFails(setDoc(doc(db, 'alertGrants/9'), { status: 'active' }));
    await assertFails(deleteDoc(doc(db, PATH)));
  });
});

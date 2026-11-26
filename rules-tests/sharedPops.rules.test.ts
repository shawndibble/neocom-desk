import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

let env: RulesTestEnvironment;
const BOOK = 98000001;
const OFFICER = 1;
const MEMBER = 2;
const ADMIN = 3;
const POPS = `sharedPops/${BOOK}`;
const SOURCES = `sharedPopSources/${BOOK}`;
const BLOCK = `communities/c1/popSharingBlocks/${BOOK}`;

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
    await setDoc(doc(db, POPS), { corporationId: BOOK, corpShared: true, pops: [] });
    await setDoc(doc(db, SOURCES), { editors: {} });
    await setDoc(doc(db, 'communities/c1'), { name: 'Ore', adminUid: `char:${ADMIN}` });
    await setDoc(doc(db, `communities/c1/members/char:${ADMIN}`), { ownerHash: 'h' });
    await setDoc(doc(db, BLOCK), { by: ADMIN, at: 1 });
    await setDoc(doc(db, `corps/${BOOK}/officers/char:${OFFICER}`), {
      ownerHash: 'h',
      corporationId: BOOK,
      canView: true,
      canEdit: true,
      expiresAt: Date.now() + 3_600_000,
    });
  });
});

const clients = [
  [
    'an officer of the book',
    (e: RulesTestEnvironment) => characterAuth(e, OFFICER, 'h').firestore(),
  ],
  [
    'a pilot in the audience',
    (e: RulesTestEnvironment) => characterAuth(e, MEMBER, 'h').firestore(),
  ],
  ["the Community's admin", (e: RulesTestEnvironment) => characterAuth(e, ADMIN, 'h').firestore()],
  [
    'an unauthenticated client',
    (e: RulesTestEnvironment) => e.unauthenticatedContext().firestore(),
  ],
] as const;

describe('Shared Pops rules', () => {
  it.each(clients)('deny %s every read', async (_n, ctx) => {
    const db = ctx(env);
    for (const path of [POPS, SOURCES, BLOCK]) await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, 'sharedPops')));
    await assertFails(getDocs(collection(db, 'communities/c1/popSharingBlocks')));
  });

  it.each(clients)('deny %s every write', async (_n, ctx) => {
    const db = ctx(env);
    for (const path of [POPS, SOURCES, BLOCK]) {
      await assertFails(setDoc(doc(db, path), { corporationId: BOOK }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });
});

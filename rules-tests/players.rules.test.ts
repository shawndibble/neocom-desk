import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Player layer: server-written only. A member reads its Player; a Character reads only its own proof doc.
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
    const db = ctx.firestore();
    await setDoc(doc(db, 'players/1'), {
      id: '1',
      characterIds: [1, 2],
      uids: ['char:1', 'char:2'],
      updatedAt: 'x',
    });
    await setDoc(doc(db, 'playerCharacters/1'), {
      characterId: 1,
      playerId: '1',
      ownerHash: 'h',
      provenAt: 'x',
    });
  });
});

describe('players rules', () => {
  it('lets a member read its Player, by get and by a uids query', async () => {
    const db = characterAuth(env, 2, 'h').firestore();
    await assertSucceeds(getDoc(doc(db, 'players/1')));
    await assertSucceeds(
      getDocs(query(collection(db, 'players'), where('uids', 'array-contains', 'char:2')))
    );
  });

  it('denies a non-member and an unauthenticated client', async () => {
    await assertFails(getDoc(doc(characterAuth(env, 3, 'h').firestore(), 'players/1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'players/1')));
  });

  it('denies every client write, member included', async () => {
    const db = characterAuth(env, 1, 'h').firestore();
    await assertFails(setDoc(doc(db, 'players/1'), { uids: ['char:1'] }));
    await assertFails(setDoc(doc(db, 'players/9'), { uids: ['char:1'] }));
    await assertFails(deleteDoc(doc(db, 'players/1')));
  });
});

describe('playerCharacters rules', () => {
  it('lets the Character itself get its proof doc, nobody else', async () => {
    await assertSucceeds(getDoc(doc(characterAuth(env, 1, 'h').firestore(), 'playerCharacters/1')));
    await assertFails(getDoc(doc(characterAuth(env, 2, 'h').firestore(), 'playerCharacters/1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'playerCharacters/1')));
  });

  it('denies list and every write', async () => {
    const db = characterAuth(env, 1, 'h').firestore();
    await assertFails(getDocs(collection(db, 'playerCharacters')));
    await assertFails(setDoc(doc(db, 'playerCharacters/1'), { playerId: '1' }));
    await assertFails(setDoc(doc(db, 'playerCharacters/9'), { playerId: '9' }));
    await assertFails(deleteDoc(doc(db, 'playerCharacters/1')));
  });
});

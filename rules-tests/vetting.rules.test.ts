import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Vetting. Everything a pilot or an officer sees comes back from a `vettingCall` action, so no
// client reads or writes any of it. A mistake here hands out a pilot's report, the raw rows a
// read returned, or the hash of the key that proves a review is theirs.
let env: RulesTestEnvironment;

const CORP = 'corps/98000001';
const REVIEW = `${CORP}/vettingReviews/r1`;

/** Every vetting document, and the collection it sits in. */
const DOCS: [path: string, parent: string][] = [
  [`${CORP}/vetting/settings`, `${CORP}/vetting`],
  // Who the overview saw holding a reviewer role: the server's, like the settings beside it.
  [`${CORP}/vetting/reviewers`, `${CORP}/vetting`],
  [REVIEW, `${CORP}/vettingReviews`],
  [`${REVIEW}/inputs/50`, `${REVIEW}/inputs`],
  [`${CORP}/vettingThrottle/50`, `${CORP}/vettingThrottle`],
];

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
    await setDoc(doc(db, `${CORP}/vetting/settings`), { on: true });
    await setDoc(doc(db, `${CORP}/vetting/reviewers`), {
      reviewers: { 'char:2': { characterId: 2, ownerHash: 'h2', lastSeenAt: 0 } },
    });
    // The pilot, the requester and a reviewer are all named on the review: none may read it.
    await setDoc(doc(db, REVIEW), {
      state: 'open',
      pilot: { characterId: 50 },
      requestedBy: { characterId: 1, uid: 'char:1', ownerHash: 'h1' },
      signOffs: [{ characterId: 2, uid: 'char:2', ownerHash: 'h2' }],
      keyHash: 'abc',
    });
    await setDoc(doc(db, `${REVIEW}/inputs/50`), { characterId: 50, json: '{}' });
    await setDoc(doc(db, `${CORP}/vettingThrottle/50`), { windowStart: 0, count: 1 });
    // An SRP officer record: officer access to SRP opens nothing here.
    await setDoc(doc(db, `${CORP}/srpOfficers/char:2`), {
      characterId: 2,
      ownerHash: 'h2',
      corporationId: 98000001,
      canEdit: true,
      expiresAt: Date.now() + 3_600_000,
    });
  });
});

const CLIENTS: [who: string, db: () => Firestore][] = [
  ['an anonymous client', () => env.unauthenticatedContext().firestore() as unknown as Firestore],
  ['the pilot', () => characterAuth(env, 50, 'h50').firestore() as unknown as Firestore],
  ['the requester', () => characterAuth(env, 1, 'h1').firestore() as unknown as Firestore],
  [
    'a reviewer who is an SRP officer',
    () => characterAuth(env, 2, 'h2').firestore() as unknown as Firestore,
  ],
];

describe.each(CLIENTS)('vetting rules: %s', (_who, client) => {
  it.each(DOCS)('cannot get %s or list its collection', async (path, parent) => {
    await assertFails(getDoc(doc(client(), path)));
    await assertFails(getDocs(collection(client(), parent)));
  });

  it.each(DOCS)('cannot create, change or delete %s', async (path, parent) => {
    await assertFails(setDoc(doc(client(), `${parent}/new`), { a: 1 }));
    await assertFails(setDoc(doc(client(), path), { a: 1 }));
    await assertFails(updateDoc(doc(client(), path), { a: 1 }));
    await assertFails(deleteDoc(doc(client(), path)));
  });

  it('cannot reach reviews or inputs through a collection group', async () => {
    await assertFails(getDocs(collectionGroup(client(), 'vettingReviews')));
    await assertFails(getDocs(collectionGroup(client(), 'inputs')));
  });
});

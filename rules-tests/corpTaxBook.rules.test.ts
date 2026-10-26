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
  updateDoc,
  where,
} from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

// Corp Tax Book (issue #4061, ADR 0023). A mistake here leaks one corp's
// mining ledger to another, or lets a demoted officer keep reading it.
let env: RulesTestEnvironment;

const CORP = 'corps/98000001';
const OTHER_CORP = 'corps/98000002';
const NOW = Date.now();
const officer = (overrides: Record<string, unknown> = {}) => ({
  characterId: 1,
  ownerHash: 'h1',
  corporationId: 98000001,
  canView: true,
  canEdit: true,
  expiresAt: NOW + 3_600_000,
  checkedAt: NOW,
  ...overrides,
});

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
    await setDoc(doc(db, CORP), { corporationId: 98000001, active: true });
    await setDoc(doc(db, `${CORP}/officers/char:1`), officer());
    await setDoc(
      doc(db, `${CORP}/officers/char:4`),
      officer({ characterId: 4, ownerHash: 'h4', expiresAt: NOW - 1000 })
    );
    await setDoc(
      doc(db, `${CORP}/officers/char:5`),
      officer({ characterId: 5, ownerHash: 'h5', canView: false })
    );
    await setDoc(doc(db, `${CORP}/observed/a`), { uid: 'char:2', characterId: 2, quantity: 5 });
    await setDoc(doc(db, `${CORP}/observed/b`), { uid: 'char:3', characterId: 3, quantity: 7 });
    await setDoc(doc(db, `${CORP}/payments/p1`), { uid: 'char:2', amount: 1 });
    await setDoc(doc(db, `${CORP}/statements/s1`), {
      uids: ['char:2', 'char:9'],
      verifyToken: 't',
    });
    await setDoc(doc(db, `${CORP}/statementLinks/s1`), { verifyToken: 't' });
    await setDoc(
      doc(db, `${CORP}/officers/char:6`),
      officer({ characterId: 6, ownerHash: 'h6', canEdit: false })
    );
    await setDoc(doc(db, `${CORP}/dismissals/d1`), { uids: ['char:2'], reason: 'x' });
    await setDoc(doc(db, `${CORP}/miners/m1`), { uids: ['char:2'], characterIds: [2] });
    await setDoc(doc(db, `${CORP}/audit/e1`), { action: 'sync' });
    await setDoc(doc(db, `${CORP}/extractions/x1`), { moonId: 1 });
    await setDoc(doc(db, `${CORP}/minerTotals/m1`), { minerId: 'm1', billed: 1 });
    await setDoc(doc(db, `${CORP}/moonDocs/x1`), { extractionId: 'x1', minerCount: 1 });
    await setDoc(doc(db, `${CORP}/meta/paid`), { ids: ['s1'] });
    await setDoc(doc(db, `${CORP}/meta/scheduledSync`), { status: 'active', characterId: 1 });
    await setDoc(doc(db, 'corpTaxBookTokens/tok'), { corporationId: 98000001 });
  });
});

const OFFICER_ONLY = [
  'audit/e1',
  'extractions/x1',
  'minerTotals/m1',
  'moonDocs/x1',
  'meta/paid',
  'meta/scheduledSync',
];
const OWN_LINE_PATHS = ['observed/a', 'payments/p1', 'statements/s1', 'dismissals/d1', 'miners/m1'];

describe('corps (Tax Book) rules', () => {
  it("lets a live officer read the whole book, and no other corp's", async () => {
    const db = characterAuth(env, 1, 'h1').firestore();
    for (const path of [...OFFICER_ONLY, ...OWN_LINE_PATHS]) {
      await assertSucceeds(getDoc(doc(db, `${CORP}/${path}`)));
    }
    await assertSucceeds(getDocs(collection(db, `${CORP}/observed`)));
    await assertFails(getDoc(doc(db, `${OTHER_CORP}/observed/a`)));
    await assertFails(getDocs(collection(db, `${OTHER_CORP}/observed`)));
  });

  it.each([
    ['an expired access record', 4, 'h4'],
    ['a record without the view flag', 5, 'h5'],
    ['an owner hash that changed (character sold)', 1, 'other'],
    ['a character with no access record', 8, 'h8'],
  ])('denies the audit log and officer-only data to %s', async (_label, id, hash) => {
    const db = characterAuth(env, id, hash).firestore();
    for (const path of OFFICER_ONLY) await assertFails(getDoc(doc(db, `${CORP}/${path}`)));
    await assertFails(getDocs(collection(db, `${CORP}/observed`)));
  });

  it('denies unauthenticated clients everything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, CORP)));
    await assertFails(getDoc(doc(db, `${CORP}/observed/a`)));
  });

  it('lets a character read only their own lines', async () => {
    const db = characterAuth(env, 2, 'h2').firestore();
    for (const path of OWN_LINE_PATHS) await assertSucceeds(getDoc(doc(db, `${CORP}/${path}`)));
    await assertSucceeds(
      getDocs(query(collection(db, `${CORP}/observed`), where('uid', '==', 'char:2')))
    );
    await assertSucceeds(
      getDocs(
        query(collection(db, `${CORP}/statements`), where('uids', 'array-contains', 'char:2'))
      )
    );
    await assertFails(getDoc(doc(db, `${CORP}/observed/b`)));
    await assertFails(getDocs(collection(db, `${CORP}/observed`)));
    await assertFails(
      getDocs(query(collection(db, `${CORP}/observed`), where('uid', '==', 'char:3')))
    );
    for (const path of OFFICER_ONLY) await assertFails(getDoc(doc(db, `${CORP}/${path}`)));
  });

  it('shows the verify link to editors only', async () => {
    await assertSucceeds(
      getDoc(doc(characterAuth(env, 1, 'h1').firestore(), `${CORP}/statementLinks/s1`))
    );
    await assertFails(
      getDoc(doc(characterAuth(env, 6, 'h6').firestore(), `${CORP}/statementLinks/s1`))
    );
    await assertFails(
      getDoc(doc(characterAuth(env, 2, 'h2').firestore(), `${CORP}/statementLinks/s1`))
    );
  });

  it('keeps own-line reads after leaving the corp (no officer record needed)', async () => {
    const db = characterAuth(env, 9, 'h9').firestore();
    await assertSucceeds(getDoc(doc(db, `${CORP}/statements/s1`)));
  });

  it('lets any signed-in character get the settings doc but never list books', async () => {
    const db = characterAuth(env, 77, 'h77').firestore();
    await assertSucceeds(getDoc(doc(db, CORP)));
    await assertFails(getDocs(collection(db, 'corps')));
  });

  it('lets an officer read only their own access record', async () => {
    await assertSucceeds(
      getDoc(doc(characterAuth(env, 1, 'h1').firestore(), `${CORP}/officers/char:1`))
    );
    await assertFails(
      getDoc(doc(characterAuth(env, 2, 'h2').firestore(), `${CORP}/officers/char:1`))
    );
    await assertFails(
      getDocs(collection(characterAuth(env, 1, 'h1').firestore(), `${CORP}/officers`))
    );
  });

  it('denies every client write, even to a live officer, and all token access', async () => {
    const db = characterAuth(env, 1, 'h1').firestore();
    await assertFails(setDoc(doc(db, `${CORP}/observed/new`), { uid: 'char:1', quantity: 1 }));
    await assertFails(updateDoc(doc(db, `${CORP}/observed/a`), { quantity: 999 }));
    await assertFails(deleteDoc(doc(db, `${CORP}/audit/e1`)));
    await assertFails(setDoc(doc(db, `${CORP}/audit/e2`), { action: 'x' }));
    await assertFails(setDoc(doc(db, `${CORP}/officers/char:1`), officer({ expiresAt: NOW * 2 })));
    await assertFails(updateDoc(doc(db, CORP), { rates: [] }));
    await assertFails(setDoc(doc(db, `${CORP}/meta/paid`), { ids: [] }));
    await assertFails(setDoc(doc(db, `${CORP}/minerTotals/m1`), { billed: 0 }));
    await assertFails(deleteDoc(doc(db, `${CORP}/minerTotals/m1`)));
    await assertFails(setDoc(doc(db, `${CORP}/moonDocs/x1`), { minerCount: 0 }));
    await assertFails(deleteDoc(doc(db, `${CORP}/moonDocs/x1`)));
    await assertFails(getDoc(doc(db, 'corpTaxBookTokens/tok')));
    const own = characterAuth(env, 2, 'h2').firestore();
    await assertFails(updateDoc(doc(own, `${CORP}/observed/a`), { quantity: 0 }));
    await assertFails(deleteDoc(doc(own, `${CORP}/payments/p1`)));
  });
});

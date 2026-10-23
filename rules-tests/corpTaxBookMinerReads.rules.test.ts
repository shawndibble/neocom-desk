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

// Issue #4622: what a miner's personal tab reads beyond its own lines. The moon owner's
// coverage copy (billed miners only, never the feeder record) and the Miner's own
// Adjustments and write-offs. Nothing here is client-writable.
let env: RulesTestEnvironment;

const BOOK = 'corps/98000001';
const COVERAGE = `${BOOK}/feederCoverage/98000002`;
const RECORD = `${BOOK}/feeders/98000002`;
const MINER = 3; // billed by the book
const STRANGER = 4; // never mined there
const OFFICER = 1;

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
    await setDoc(doc(db, COVERAGE), { coveragePeriods: [{ from: '2026-10-01' }] });
    await setDoc(doc(db, RECORD), { status: 'active', payee: { kind: 'character', id: 9 } });
    await setDoc(doc(db, `corpTaxBookBilledBy/char:${MINER}`), { books: { '98000001': 1 } });
    await setDoc(doc(db, `corpTaxBookBilledBy/char:${STRANGER}`), { books: { '98000009': 1 } });
    await setDoc(doc(db, `${BOOK}/officers/char:${OFFICER}`), {
      ownerHash: 'h',
      corporationId: 98000001,
      canView: true,
      expiresAt: Date.now() + 3_600_000,
    });
    for (const kind of ['adjustments', 'writeOffs']) {
      await setDoc(doc(db, `${BOOK}/${kind}/mine`), { minerId: 'solo:3', uids: [`char:${MINER}`] });
      await setDoc(doc(db, `${BOOK}/${kind}/theirs`), { minerId: 'solo:4', uids: ['char:4'] });
      await setDoc(doc(db, `${BOOK}/${kind}/old`), { minerId: 'solo:3' });
    }
  });
});

const as = (characterId: number) => characterAuth(env, characterId, 'h').firestore();

describe('moon owner coverage copy', () => {
  it('lets a miner the book bills read it, and list it', async () => {
    await assertSucceeds(getDoc(doc(as(MINER), COVERAGE)));
    await assertSucceeds(getDocs(collection(as(MINER), `${BOOK}/feederCoverage`)));
  });

  it('lets an officer read it', async () => {
    await assertSucceeds(getDoc(doc(as(OFFICER), COVERAGE)));
  });

  it('denies a character another book bills, one with no pointer, and a signed-out client', async () => {
    await assertFails(getDoc(doc(as(STRANGER), COVERAGE)));
    await assertFails(getDoc(doc(as(5), COVERAGE)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), COVERAGE)));
  });

  it('still denies the billed miner the feeder record itself', async () => {
    await assertFails(getDoc(doc(as(MINER), RECORD)));
  });

  it.each([OFFICER, MINER])('denies character %i every write', async (id) => {
    await assertFails(setDoc(doc(as(id), COVERAGE), { coveragePeriods: [] }));
    await assertFails(setDoc(doc(as(id), `${BOOK}/feederCoverage/new`), { coveragePeriods: [] }));
    await assertFails(deleteDoc(doc(as(id), COVERAGE)));
  });
});

describe.each(['adjustments', 'writeOffs'])('a Miner’s own %s', (kind) => {
  it('lets the Miner read their own, by query', async () => {
    await assertSucceeds(getDoc(doc(as(MINER), `${BOOK}/${kind}/mine`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(as(MINER), `${BOOK}/${kind}`),
          where('uids', 'array-contains', `char:${MINER}`)
        )
      )
    );
  });

  it("denies another Miner's, one written before uids, and an unfiltered list", async () => {
    await assertFails(getDoc(doc(as(MINER), `${BOOK}/${kind}/theirs`)));
    await assertFails(getDoc(doc(as(MINER), `${BOOK}/${kind}/old`)));
    await assertFails(getDocs(collection(as(MINER), `${BOOK}/${kind}`)));
  });

  it('lets an officer read them all', async () => {
    await assertSucceeds(getDocs(collection(as(OFFICER), `${BOOK}/${kind}`)));
  });

  it('denies every write', async () => {
    await assertFails(setDoc(doc(as(MINER), `${BOOK}/${kind}/mine`), { amount: 0 }));
    await assertFails(setDoc(doc(as(OFFICER), `${BOOK}/${kind}/new`), { amount: 0 }));
  });
});

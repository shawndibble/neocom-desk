import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
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

// Collector books (issue #4512): the moon owner's view. Readable only through its own access
// record, never the raw book, another moon owner's view or the book's officer docs.
describe('moon owner view', () => {
  const MOON_OWNER = 5;
  const FEEDER = 98000002;
  const OTHER_FEEDER = 98000003;
  const VIEW = `corpTaxBooks/98000001/feederViews/${FEEDER}`;
  const OTHER_VIEW = `corpTaxBooks/98000001/feederViews/${OTHER_FEEDER}`;
  const viewer = (over: Record<string, unknown> = {}) => ({
    uid: `char:${MOON_OWNER}`,
    characterId: MOON_OWNER,
    ownerHash: 'h',
    corporationId: FEEDER,
    canView: true,
    canEdit: true,
    expiresAt: Date.now() + 3_600_000,
    ...over,
  });
  const owner = () => characterAuth(env, MOON_OWNER, 'h').firestore();

  async function seed(access: Record<string, unknown> | null = viewer()) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const v of [VIEW, OTHER_VIEW]) {
        await setDoc(doc(db, v), { schemaVersion: 1 });
        await setDoc(doc(db, `${v}/days/2026-10-12`), { date: '2026-10-12' });
        await setDoc(doc(db, `${v}/refineries/77`), { structureId: 77 });
        await setDoc(doc(db, `${v}/payouts/p1`), { amount: 1 });
      }
      await setDoc(doc(db, 'corpTaxBookFeederPrevious/98000002'), {
        collectorCorporationId: 98000001,
      });
      await setDoc(doc(db, 'corpTaxBooks/98000001/observed/row'), { uid: 'char:900' });
      await setDoc(doc(db, 'corpTaxBooks/98000001/miners/900'), { uids: ['char:900'] });
      await setDoc(doc(db, 'corpTaxBooks/98000001/statements/s1'), { uids: ['char:900'] });
      await setDoc(doc(db, 'corpTaxBooks/98000001/audit/a1'), { action: 'x' });
      await setDoc(doc(db, 'corpTaxBooks/98000001/meta/rates'), { x: 1 });
      if (access) await setDoc(doc(db, `${VIEW}/viewers/char:${MOON_OWNER}`), access);
    });
  }

  it('lets the moon owner read its own summary, days, refineries and payouts', async () => {
    await seed();
    const db = owner();
    await assertSucceeds(getDoc(doc(db, VIEW)));
    await assertSucceeds(getDoc(doc(db, `${VIEW}/days/2026-10-12`)));
    await assertSucceeds(getDoc(doc(db, `${VIEW}/refineries/77`)));
    await assertSucceeds(getDoc(doc(db, `${VIEW}/payouts/p1`)));
    await assertSucceeds(getDocs(collection(db, `${VIEW}/days`)));
    await assertSucceeds(getDoc(doc(db, `${VIEW}/viewers/char:${MOON_OWNER}`)));
  });

  it('denies it the raw book, the miner side and the audit log', async () => {
    await seed();
    const db = owner();
    for (const path of [
      'corpTaxBooks/98000001/observed/row',
      'corpTaxBooks/98000001/miners/900',
      'corpTaxBooks/98000001/statements/s1',
      'corpTaxBooks/98000001/audit/a1',
      'corpTaxBooks/98000001/meta/rates',
      RECORD,
      PAYOUT,
      'corpTaxBooks/98000001/officers/char:5',
      'corpTaxBookFeederPrevious/98000002',
      POINTER,
    ]) {
      await assertFails(getDoc(doc(db, path)));
    }
    await assertFails(getDocs(collection(db, 'corpTaxBooks/98000001/observed')));
    await assertFails(getDocs(collection(db, 'corpTaxBooks/98000001/feeders')));
  });

  it('denies another moon owner view', async () => {
    await seed();
    const db = owner();
    await assertFails(getDoc(doc(db, OTHER_VIEW)));
    await assertFails(getDoc(doc(db, `${OTHER_VIEW}/days/2026-10-12`)));
    await assertFails(getDocs(collection(db, `${OTHER_VIEW}/payouts`)));
  });

  it('denies a record for another corporation, a lapsed one, one for another hash, and none', async () => {
    for (const access of [
      viewer({ corporationId: OTHER_FEEDER }),
      viewer({ expiresAt: Date.now() - 1000 }),
      viewer({ ownerHash: 'other' }),
      viewer({ canView: false }),
      null,
    ]) {
      await env.clearFirestore();
      await seed(access);
      await assertFails(getDoc(doc(owner(), VIEW)));
      await assertFails(getDoc(doc(owner(), `${VIEW}/days/2026-10-12`)));
    }
  });

  it('denies the viewer record to anyone but its character, and lists of the view', async () => {
    await seed();
    await assertFails(
      getDoc(doc(characterAuth(env, 6, 'h').firestore(), `${VIEW}/viewers/char:${MOON_OWNER}`))
    );
    await assertFails(
      getDoc(
        doc(
          characterAuth(env, MOON_OWNER, 'wrong').firestore(),
          `${VIEW}/viewers/char:${MOON_OWNER}`
        )
      )
    );
    await assertFails(getDocs(collection(owner(), `${VIEW}/viewers`)));
    await assertFails(getDocs(collection(owner(), `corpTaxBooks/98000001/feederViews`)));
  });

  it('denies every client write under the view, the moon owner included', async () => {
    await seed();
    const db = owner();
    for (const path of [
      VIEW,
      `${VIEW}/days/2026-10-12`,
      `${VIEW}/days/new`,
      `${VIEW}/refineries/77`,
      `${VIEW}/payouts/p1`,
      `${VIEW}/viewers/char:${MOON_OWNER}`,
      `${VIEW}/viewers/char:6`,
    ]) {
      await assertFails(setDoc(doc(db, path), { x: 1 }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  });

  it('denies an unauthenticated client and an officer of the book without a record', async () => {
    await seed();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), VIEW)));
    await assertFails(getDoc(doc(characterAuth(env, OFFICER, 'h').firestore(), VIEW)));
    await assertFails(
      getDoc(doc(characterAuth(env, OFFICER, 'h').firestore(), `${VIEW}/days/2026-10-12`))
    );
  });
});

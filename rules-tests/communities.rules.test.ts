import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { batchLines } from '../src/engine/communities/delivery';
import { characterAuth, createRulesEnv } from './testEnv';

// Communities (issue #3596, ADR 0018): reads are gated by Community
// membership, writes by the owning Character under the ownerHash guard.
// A mistake here leaks one player's asset locations to another.
let env: RulesTestEnvironment;

const C = 'communities/c1';
const MEMBER_1 = `${C}/members/char:1`;
const MEMBER_2 = `${C}/members/char:2`;

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
    await setDoc(doc(db, C), { name: 'Pals', adminUid: 'char:1', memberCount: 2 });
    await setDoc(doc(db, MEMBER_1), { ownerHash: 'hash-1', joinedAt: 1, characterName: 'One' });
    await setDoc(doc(db, MEMBER_2), { ownerHash: 'hash-2', joinedAt: 1, characterName: 'Two' });
    await setDoc(doc(db, `${MEMBER_1}/library/0`), { ownerHash: 'hash-1', items: [{ typeId: 1 }] });
    await setDoc(doc(db, `${C}/fittings/char:1~saved-a1`), {
      ownerHash: 'hash-1',
      ownerUid: 'char:1',
      source: 'saved',
      name: 'Cheap Rifter',
      hull: 'Rifter',
      code: 'CODE',
      updatedAt: 1,
    });
    await setDoc(doc(db, `${C}/requests/char:9`), {
      ownerHash: 'hash-9',
      characterName: 'Nine',
      requestedAt: 1,
    });
    await setDoc(doc(db, `${C}/mailInvites/42`), {
      adminUid: 'char:1',
      targetName: 'Bob',
      day: '2026-10-12',
    });
    await setDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-12'), {
      count: 3,
      ownerHash: 'hash-1',
    });
    await setDoc(doc(db, 'characters/char:1/communities/c1'), {
      ownerHash: 'hash-1',
      communityId: 'c1',
    });
  });
});

describe('reads', () => {
  it('lets a Member read the Community, its Members and their libraries', async () => {
    const db = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDoc(doc(db, C)));
    await assertSucceeds(getDoc(doc(db, MEMBER_1)));
    await assertSucceeds(getDocs(collection(db, `${C}/members`)));
    await assertSucceeds(getDoc(doc(db, `${MEMBER_1}/library/0`)));
    await assertSucceeds(getDocs(collection(db, `${MEMBER_1}/library`)));
  });

  it('denies a Character who is not a Member', async () => {
    const db = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(getDoc(doc(db, C)));
    await assertFails(getDoc(doc(db, MEMBER_1)));
    await assertFails(getDocs(collection(db, `${C}/members`)));
    await assertFails(getDoc(doc(db, `${MEMBER_1}/library/0`)));
    await assertFails(getDocs(collection(db, `${MEMBER_1}/library`)));
  });

  it('denies unauthenticated reads', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, C)));
    await assertFails(getDoc(doc(db, `${MEMBER_1}/library/0`)));
  });

  it('denies a transferred Character (same uid, new ownerHash) the old membership', async () => {
    const db = characterAuth(env, 2, 'hash-2-new-owner').firestore();
    await assertFails(getDoc(doc(db, C)));
    await assertFails(getDoc(doc(db, `${MEMBER_1}/library/0`)));
  });

  it('lets a Character list its own membership index, not another’s', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(getDocs(collection(db, 'characters/char:1/communities')));
    await assertFails(
      getDocs(
        collection(
          env.authenticatedContext('char:2', { ownerHash: 'hash-2' }).firestore(),
          'characters/char:1/communities'
        )
      )
    );
  });
});

describe('Community and Member docs are server-written', () => {
  it('denies every client write to the Community doc', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, 'communities/new'), { name: 'x', adminUid: 'char:1' }));
    await assertFails(updateDoc(doc(db, C), { name: 'renamed' }));
    await assertFails(updateDoc(doc(db, C), { memberCount: 1 }));
    await assertFails(deleteDoc(doc(db, C)));
  });

  it('denies a Member self-joining, self-removing or removing another', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, `${C}/members/char:1x`), { ownerHash: 'hash-1' }));
    await assertFails(deleteDoc(doc(db, MEMBER_1)));
    await assertFails(deleteDoc(doc(db, MEMBER_2)));
    const outsider = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(setDoc(doc(outsider, `${C}/members/char:3`), { ownerHash: 'hash-3' }));
  });

  it('denies client writes to the membership index', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, 'characters/char:1/communities/c9'), { ownerHash: 'hash-1' }));
    await assertFails(deleteDoc(doc(db, 'characters/char:1/communities/c1')));
  });
});

describe('Member pushed-at stamp', () => {
  it('lets a Member update only their own stamp fields', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(
      updateDoc(doc(db, MEMBER_1), {
        pushedAt: serverTimestamp(),
        libraryHash: 'abc',
        chunkCount: 1,
      })
    );
  });

  it('denies changing other fields, a forged time, or another Member’s stamp', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(updateDoc(doc(db, MEMBER_1), { joinedAt: 2 }));
    await assertFails(updateDoc(doc(db, MEMBER_1), { ownerHash: 'hash-2' }));
    await assertFails(
      updateDoc(doc(db, MEMBER_1), { pushedAt: 5, libraryHash: 'a', chunkCount: 1 })
    );
    await assertFails(
      updateDoc(doc(db, MEMBER_2), { pushedAt: serverTimestamp(), libraryHash: 'a', chunkCount: 1 })
    );
  });
});

describe('library chunks', () => {
  it('lets a Member write and delete their own chunks', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(
      setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'hash-1', items: [{ typeId: 2 }] })
    );
    await assertSucceeds(deleteDoc(doc(db, `${MEMBER_1}/library/1`)));
  });

  it('denies writing into another Member’s library', async () => {
    const db = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'hash-2', items: [] }));
    await assertFails(deleteDoc(doc(db, `${MEMBER_1}/library/0`)));
  });

  it('denies a non-Member writing a library, even their own uid path', async () => {
    const db = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(
      setDoc(doc(db, `${C}/members/char:3/library/0`), { ownerHash: 'hash-3', items: [] })
    );
  });

  it('denies a forged ownerHash, extra fields, oversized chunks and odd chunk ids', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'forged', items: [] }));
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'hash-1', items: [], extra: 1 })
    );
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/1`), {
        ownerHash: 'hash-1',
        items: Array.from({ length: 501 }, (_, i) => ({ typeId: i })),
      })
    );
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/200`), { ownerHash: 'hash-1', items: [] })
    );
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/abc`), { ownerHash: 'hash-1', items: [] })
    );
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'hash-1', items: 'nope' })
    );
  });

  it('denies a transferred Character writing under the old Member doc', async () => {
    const db = characterAuth(env, 1, 'hash-1-new-owner').firestore();
    await assertFails(
      setDoc(doc(db, `${MEMBER_1}/library/1`), { ownerHash: 'hash-1-new-owner', items: [] })
    );
  });
});

describe('mail invites', () => {
  it('lets the admin read the invites sent and their own daily count', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(getDoc(doc(db, `${C}/mailInvites/42`)));
    await assertSucceeds(getDocs(collection(db, `${C}/mailInvites`)));
    await assertSucceeds(getDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-12')));
  });

  it('lets the admin read a day’s count before any invite went out that day', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(getDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-13')));
    const other = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(getDoc(doc(other, 'characters/char:1/mailInviteQuota/2026-10-13')));
  });

  it('hides them from other Members, non-Members and another Character’s quota', async () => {
    const member = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(getDoc(doc(member, `${C}/mailInvites/42`)));
    await assertFails(getDocs(collection(member, `${C}/mailInvites`)));
    await assertFails(getDoc(doc(member, 'characters/char:1/mailInviteQuota/2026-10-12')));
    const outsider = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(getDoc(doc(outsider, `${C}/mailInvites/42`)));
  });

  it('denies every client write, the admin’s included', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, `${C}/mailInvites/43`), { adminUid: 'char:1' }));
    await assertFails(updateDoc(doc(db, `${C}/mailInvites/42`), { sentAt: 1 }));
    await assertFails(deleteDoc(doc(db, `${C}/mailInvites/42`)));
    await assertFails(
      setDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-13'), { count: 0 })
    );
    await assertFails(
      updateDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-12'), { count: 0 })
    );
  });

  it('denies a transferred Character the old admin’s invites', async () => {
    const db = characterAuth(env, 1, 'hash-1-new-owner').firestore();
    await assertFails(getDoc(doc(db, `${C}/mailInvites/42`)));
    await assertFails(getDoc(doc(db, 'characters/char:1/mailInviteQuota/2026-10-12')));
  });
});

describe('join requests', () => {
  it('lets the admin read the Characters waiting to join', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(getDoc(doc(db, `${C}/requests/char:9`)));
    await assertSucceeds(getDocs(collection(db, `${C}/requests`)));
  });

  it('hides them from other Members, non-Members and the waiting Character', async () => {
    const member = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(getDoc(doc(member, `${C}/requests/char:9`)));
    await assertFails(getDocs(collection(member, `${C}/requests`)));
    const waiting = characterAuth(env, 9, 'hash-9').firestore();
    await assertFails(getDoc(doc(waiting, `${C}/requests/char:9`)));
  });

  it('denies every client write, the admin’s and the requester’s included', async () => {
    const admin = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(admin, `${C}/requests/char:8`), { characterName: 'x' }));
    await assertFails(deleteDoc(doc(admin, `${C}/requests/char:9`)));
    const waiting = characterAuth(env, 9, 'hash-9').firestore();
    await assertFails(setDoc(doc(waiting, `${C}/requests/char:9`), { characterName: 'x' }));
  });

  it('denies a transferred admin Character the old admin’s requests', async () => {
    const db = characterAuth(env, 1, 'hash-1-new-owner').firestore();
    await assertFails(getDoc(doc(db, `${C}/requests/char:9`)));
  });
});

describe('shared Skill Plans', () => {
  const PLAN_1 = `${C}/skillPlans/char:1~plan-a1`;
  const plan = (over: Record<string, unknown> = {}) => ({
    ownerHash: 'hash-1',
    ownerUid: 'char:1',
    name: 'Marauder',
    entries: [3300, 5, 1, 3301, 3, 2],
    sourceUpdatedAt: 1000,
    updatedAt: serverTimestamp(),
    ...over,
  });

  it('lets a Member list and read them, and nobody else', async () => {
    const member = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDocs(collection(member, `${C}/skillPlans`)));
    const outsider = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(getDocs(collection(outsider, `${C}/skillPlans`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), PLAN_1)));
  });

  it('lets a Member write, re-push and delete their own', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(setDoc(doc(db, PLAN_1), plan()));
    await assertSucceeds(setDoc(doc(db, PLAN_1), plan({ sourceUpdatedAt: 2000 })));
    await assertSucceeds(deleteDoc(doc(db, PLAN_1)));
  });

  it('denies writing or deleting under another Member’s id', async () => {
    const db = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(setDoc(doc(db, PLAN_1), plan({ ownerHash: 'hash-2', ownerUid: 'char:2' })));
    await assertFails(deleteDoc(doc(db, PLAN_1)));
  });

  it('denies an id that is not <uid>~<plan id>', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, `${C}/skillPlans/plain`), plan()));
    await assertFails(setDoc(doc(db, `${C}/skillPlans/char:1~a~b`), plan()));
    await assertFails(setDoc(doc(db, `${C}/skillPlans/char:1~`), plan()));
  });

  it('denies a non-Member and a transferred Character writing', async () => {
    await assertFails(
      setDoc(
        doc(characterAuth(env, 3, 'hash-3').firestore(), `${C}/skillPlans/char:3~p`),
        plan({ ownerHash: 'hash-3', ownerUid: 'char:3' })
      )
    );
    await assertFails(
      setDoc(
        doc(characterAuth(env, 1, 'hash-1-new-owner').firestore(), PLAN_1),
        plan({ ownerHash: 'hash-1-new-owner' })
      )
    );
  });

  it('denies a forged owner, extra fields and a forged time', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, PLAN_1), plan({ ownerHash: 'forged' })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ ownerUid: 'char:2' })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ notes: 'private' })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ updatedAt: 5 })));
  });

  it('denies an empty or oversized name, entries that are not whole triples, and wrong types', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, PLAN_1), plan({ name: '' })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ name: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ entries: [1, 2] })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ entries: new Array(1503).fill(1) })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ entries: 'nope' })));
    await assertFails(setDoc(doc(db, PLAN_1), plan({ sourceUpdatedAt: 'now' })));
  });
});

describe('shared Fittings', () => {
  const FIT_1 = `${C}/fittings/char:1~saved-a1`;
  const fit = (over: Record<string, unknown> = {}) => ({
    ownerHash: 'hash-1',
    ownerUid: 'char:1',
    source: 'saved',
    name: 'Rifter',
    hull: 'Rifter',
    code: 'CODE',
    updatedAt: serverTimestamp(),
    ...over,
  });

  it('lets a Member list and read them, and nobody else', async () => {
    const member = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDoc(doc(member, FIT_1)));
    await assertSucceeds(getDocs(collection(member, `${C}/fittings`)));
    const outsider = characterAuth(env, 3, 'hash-3').firestore();
    await assertFails(getDoc(doc(outsider, FIT_1)));
    await assertFails(getDocs(collection(outsider, `${C}/fittings`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), FIT_1)));
  });

  it('denies a transferred Character the old membership', async () => {
    const db = characterAuth(env, 2, 'hash-2-new-owner').firestore();
    await assertFails(getDocs(collection(db, `${C}/fittings`)));
  });

  it('lets a Member write, re-push and delete their own, saved or in-game', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(setDoc(doc(db, FIT_1), fit()));
    await assertSucceeds(setDoc(doc(db, `${C}/fittings/char:1~game-987`), fit({ source: 'game' })));
    await assertSucceeds(deleteDoc(doc(db, FIT_1)));
  });

  it('denies writing or deleting under another Member’s id', async () => {
    const db = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(setDoc(doc(db, FIT_1), fit({ ownerHash: 'hash-2', ownerUid: 'char:2' })));
    await assertFails(
      setDoc(doc(db, `${C}/fittings/char:1~saved-new`), fit({ ownerHash: 'hash-2' }))
    );
    await assertFails(deleteDoc(doc(db, FIT_1)));
  });

  it('denies an id that is not <uid>~<source>-<key>', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, `${C}/fittings/plain`), fit()));
    await assertFails(setDoc(doc(db, `${C}/fittings/char:1~other-1`), fit()));
    await assertFails(setDoc(doc(db, `${C}/fittings/char:1~game-1`), fit({ source: 'saved' })));
    await assertFails(setDoc(doc(db, `${C}/fittings/char:1~saved-1~x`), fit()));
  });

  it('denies a non-Member and a transferred Character writing', async () => {
    await assertFails(
      setDoc(
        doc(characterAuth(env, 3, 'hash-3').firestore(), `${C}/fittings/char:3~saved-1`),
        fit({ ownerHash: 'hash-3', ownerUid: 'char:3' })
      )
    );
    await assertFails(
      setDoc(
        doc(characterAuth(env, 1, 'hash-1-new-owner').firestore(), FIT_1),
        fit({ ownerHash: 'hash-1-new-owner' })
      )
    );
  });

  it('denies a forged ownerHash or ownerUid, extra fields (notes), and a forged time', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, FIT_1), fit({ ownerHash: 'forged' })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ ownerUid: 'char:2' })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ notes: 'private' })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ updatedAt: 5 })));
  });

  it('denies empty or oversized names and codes, and wrong types', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertFails(setDoc(doc(db, FIT_1), fit({ name: '' })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ name: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ code: '' })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ code: 'x'.repeat(90001) })));
    await assertFails(setDoc(doc(db, FIT_1), fit({ hull: 7 })));
  });
});

// Requests (issue #3807, ADR 0021): the whole Community reads them; only the
// callables write, so even the requester's own client writes are denied.
// Pledges (issue #3808) are the exception: each Member writes their own.
describe('Requests', () => {
  const REQ = `${C}/itemRequests/r1`;
  const CLOSED_REQ = `${C}/itemRequests/r-closed`;
  const EXPIRED_REQ = `${C}/itemRequests/r-expired`;
  const PLEDGE = `${REQ}/pledges/char:2`;
  const DAY = 86_400_000;
  const request = (over: Record<string, unknown> = {}) => ({
    ownerUid: 'char:1',
    ownerHash: 'hash-1',
    ownerName: 'One',
    location: 'Efa',
    terms: '',
    lines: [
      { typeId: 1, name: 'Tritanium', quantity: 5, kind: 'item' },
      { typeId: 2, name: 'Pyerite', quantity: 9, kind: 'item' },
    ],
    createdAt: 1,
    lastActivityAt: 1,
    expiresAt: Date.now() + 30 * DAY,
    closed: false,
    ...over,
  });
  const entry = (quantity: number, over: Record<string, unknown> = {}) => ({
    quantity,
    delivered: 0,
    contractIds: [],
    ...over,
  });
  const pledgeDoc = (lines: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    ownerHash: 'hash-2',
    communityId: 'c1',
    lines,
    updatedAt: serverTimestamp(),
    ...over,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, REQ), request());
      await setDoc(doc(db, CLOSED_REQ), request({ closed: true }));
      await setDoc(doc(db, EXPIRED_REQ), request({ expiresAt: Date.now() - DAY }));
      for (const parent of [CLOSED_REQ, EXPIRED_REQ]) {
        await setDoc(doc(db, `${parent}/pledges/char:2`), {
          ownerHash: 'hash-2',
          communityId: 'c1',
          lines: { 0: entry(1) },
          updatedAt: new Date(),
        });
      }
      await setDoc(doc(db, PLEDGE), {
        ownerHash: 'hash-2',
        communityId: 'c1',
        lines: { 0: entry(1) },
        updatedAt: new Date(),
      });
      await setDoc(doc(db, `${REQ}/pledgeMails/char:42`), {
        senderUid: 'char:1',
        day: '2026-10-12',
      });
      await setDoc(doc(db, 'characters/char:1/requestMailQuota/2026-10-12'), {
        count: 3,
        ownerHash: 'hash-1',
      });
    });
  });

  it('lets any Member list and read them and their Pledges', async () => {
    const db = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDoc(doc(db, REQ)));
    await assertSucceeds(getDocs(collection(db, `${C}/itemRequests`)));
    await assertSucceeds(getDoc(doc(db, PLEDGE)));
    await assertSucceeds(getDocs(collection(db, `${REQ}/pledges`)));
  });

  it('hides them from a non-Member, an unauthenticated visitor and a transferred Character', async () => {
    for (const db of [
      characterAuth(env, 3, 'hash-3').firestore(),
      env.unauthenticatedContext().firestore(),
      characterAuth(env, 2, 'hash-2-new-owner').firestore(),
    ]) {
      await assertFails(getDoc(doc(db, REQ)));
      await assertFails(getDocs(collection(db, `${C}/itemRequests`)));
      await assertFails(getDoc(doc(db, PLEDGE)));
    }
  });

  it('denies every client write to a Request itself, the requester’s and another Member’s alike', async () => {
    for (const db of [
      characterAuth(env, 1, 'hash-1').firestore(),
      characterAuth(env, 2, 'hash-2').firestore(),
    ]) {
      await assertFails(updateDoc(doc(db, REQ), { closed: true }));
      await assertFails(updateDoc(doc(db, REQ), { terms: 'hijacked' }));
      await assertFails(deleteDoc(doc(db, REQ)));
      await assertFails(setDoc(doc(db, `${C}/itemRequests/r2`), { ownerUid: 'char:1' }));
    }
  });

  describe('Pledges', () => {
    const NEW_PLEDGE = (uid: number) => `${REQ}/pledges/char:${uid}`;

    it('lets a Member create, update and withdraw their own Pledge', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(40), 1: entry(2) })));
      await assertSucceeds(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(40, { delivered: 3, contractIds: [9] }) }))
      );
      await assertSucceeds(deleteDoc(doc(db, PLEDGE)));
    });

    it('lets a Member over-pledge: the quantity may exceed the need', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5_000_000) })));
    });

    it('denies writing or withdrawing another Member’s Pledge', async () => {
      const db = characterAuth(env, 1, 'hash-1').firestore();
      const other = characterAuth(env, 3, 'hash-3').firestore();
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-1' }))
      );
      await assertFails(deleteDoc(doc(db, PLEDGE)));
      await assertFails(setDoc(doc(other, PLEDGE), pledgeDoc({ 0: entry(1) })));
    });

    it('denies the admin removing a Request or a Pledge from the client: removal is a callable', async () => {
      // char:1 is the Community's admin; the Request below is char:2's.
      const admin = characterAuth(env, 1, 'hash-1').firestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `${C}/itemRequests/r-theirs`),
          request({ ownerUid: 'char:2', ownerHash: 'hash-2' })
        );
      });
      await assertFails(deleteDoc(doc(admin, `${C}/itemRequests/r-theirs`)));
      await assertFails(deleteDoc(doc(admin, PLEDGE)));
    });

    it('denies the requester Pledging on their own Request', async () => {
      const db = characterAuth(env, 1, 'hash-1').firestore();
      await assertFails(
        setDoc(doc(db, NEW_PLEDGE(1)), pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-1' }))
      );
    });

    it('denies a non-Member and a transferred Character', async () => {
      await assertFails(
        setDoc(
          doc(characterAuth(env, 3, 'hash-3').firestore(), NEW_PLEDGE(3)),
          pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-3' })
        )
      );
      await assertFails(
        setDoc(
          doc(characterAuth(env, 2, 'hash-2-new-owner').firestore(), PLEDGE),
          pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-2-new-owner' })
        )
      );
    });

    it('denies a Pledge on a closed or an expired Request', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(
        setDoc(doc(db, `${CLOSED_REQ}/pledges/char:2`), pledgeDoc({ 0: entry(1) }))
      );
      await assertFails(
        setDoc(doc(db, `${EXPIRED_REQ}/pledges/char:2`), pledgeDoc({ 0: entry(1) }))
      );
    });

    it('denies a quantity that is not a positive integer or is beyond the cap', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      for (const quantity of [0, -4, 1.5, '7', 1_000_000_000_001]) {
        await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(quantity as number) })));
      }
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1_000_000_000_000) })));
    });

    it('denies a line the Request does not have, and keys that are not line indexes', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 2: entry(1) })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 49: entry(1) })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 50: entry(1) })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ x: entry(1) })));
    });

    it('validates every contract id: positive integers, at most 10 a line', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { contractIds: [1, 2, 3, 19] }) }))
      );
      await assertSucceeds(
        setDoc(
          doc(db, PLEDGE),
          pledgeDoc({ 0: entry(1, { contractIds: Array.from({ length: 10 }, (_, i) => i + 1) }) })
        )
      );
      for (const contractIds of [
        ['x'],
        [1.5],
        [0],
        [-3],
        [1, 'a' + 'b'.repeat(5000)],
        [{ a: 1 }],
      ]) {
        await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { contractIds }) })));
      }
    });

    it('still allows a write that changes several lines at once', async () => {
      // Four plain lines cost more than the rules' budget since `auto`/`through`; the batcher splits at three.
      const SEVERAL = 3;
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), REQ),
          request({
            lines: Array.from({ length: SEVERAL }, (_, i) => ({
              typeId: i + 1,
              name: `T${i}`,
              quantity: 5,
              kind: 'item',
            })),
          })
        );
      });
      const db = characterAuth(env, 2, 'hash-2').firestore();
      const lines = Object.fromEntries(
        Array.from({ length: SEVERAL }, (_, i) => [
          String(i),
          entry(3, { contractIds: [i + 1, i + 100] }),
        ])
      );
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc(lines)));
    });

    it('accepts every write the delivery batcher plans, worst cases included (#3809)', async () => {
      // Pins `batchLines`' cost model to the rules' 1000-expression budget: an
      // unbatched write of four full lines is denied, a batched one never is.
      const COUNT = 12;
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), REQ),
          request({
            lines: Array.from({ length: COUNT }, (_, i) => ({
              typeId: i + 1,
              name: `T${i}`,
              quantity: 50,
              kind: 'item',
            })),
          })
        );
      });
      const db = characterAuth(env, 2, 'hash-2').firestore();
      const idCounts = [10, 10, 0, 1, 5, 10, 10, 3, 3, 3, 2, 10];
      const changed = idCounts.map((count, index) => ({
        index,
        entry: {
          quantity: 50,
          delivered: 40,
          contractIds: Array.from({ length: count }, (_, i) => i + 1),
          manual: index % 2 === 0 ? 40 : undefined,
          auto: 90,
          through: 1_760_000_000_000,
        },
      }));
      let stored: Record<string, unknown> = { 0: entry(1) };
      for (const batch of batchLines(changed)) {
        expect(batch.length).toBeLessThanOrEqual(4);
        for (const { index, entry: e } of batch) {
          stored = {
            ...stored,
            [String(index)]: {
              quantity: e.quantity,
              delivered: e.delivered,
              contractIds: e.contractIds,
              ...(e.manual !== undefined ? { manual: e.manual } : {}),
              auto: e.auto,
              through: e.through,
            },
          };
        }
        await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc(stored)));
      }
    });

    it('denies one write that changes four full lines: the budget the batcher respects (#3809)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), REQ),
          request({
            lines: Array.from({ length: 4 }, (_, i) => ({
              typeId: i + 1,
              name: `T${i}`,
              quantity: 50,
              kind: 'item',
            })),
          })
        );
      });
      const db = characterAuth(env, 2, 'hash-2').firestore();
      const ids = Array.from({ length: 10 }, (_, i) => i + 1);
      const lines = Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [
          String(i),
          entry(50, {
            delivered: 40,
            contractIds: ids,
            manual: 40,
            auto: 90,
            through: 1_760_000_000_000,
          }),
        ])
      );
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc(lines)));
    });

    it('bounds delivered and a typed amount by the Pledged quantity, and contract ids at 10 (#3809)', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { delivered: 5, manual: 5 }) }))
      );
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { delivered: 6 }) })));
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { delivered: 5, manual: 6 }) }))
      );
      await assertFails(
        setDoc(
          doc(db, PLEDGE),
          pledgeDoc({ 0: entry(5, { contractIds: Array.from({ length: 11 }, (_, i) => i + 1) }) })
        )
      );
    });

    it('bounds the stored contract figure and its finish time, and accepts entries without them (#3809)', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      // `auto` is kept unclamped: above a lowered quantity is fine.
      await assertSucceeds(
        setDoc(
          doc(db, PLEDGE),
          pledgeDoc({ 0: entry(5, { delivered: 5, auto: 80, through: 1_760_000_000_000 }) })
        )
      );
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5) })));
      for (const bad of [-1, 1.5, 'x', 1_000_000_000_001]) {
        await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { auto: bad }) })));
      }
      for (const bad of [-1, 1.5, 'x', 4_000_000_000_001]) {
        await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { through: bad }) })));
      }
    });

    it('bounds a typed delivered amount: a positive whole number up to the cap (#3809)', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { delivered: 3, manual: 3 }) }))
      );
      for (const manual of [0, -1, 1.5, 'x', 1_000_000_000_001]) {
        await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(5, { manual }) })));
      }
    });

    it('denies marking a delivery once the Request is closed or expired (#3809)', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      for (const parent of [CLOSED_REQ, EXPIRED_REQ]) {
        await assertFails(
          setDoc(
            doc(db, `${parent}/pledges/char:2`),
            pledgeDoc({ 0: entry(1, { delivered: 1, contractIds: [9] }) })
          )
        );
      }
    });

    it('denies lines or an entry that is not a map', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc([entry(1)] as unknown as Record<string, unknown>))
      );
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: 5 })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: [1] })));
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc('x' as unknown as Record<string, unknown>))
      );
    });

    it('denies more lines than a Request can have', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      const lines = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [String(i), entry(1)]));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc(lines)));
    });

    it('denies an update on a closed or an expired Request, but still lets the Member withdraw', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      for (const parent of [CLOSED_REQ, EXPIRED_REQ]) {
        const ref = doc(db, `${parent}/pledges/char:2`);
        await assertFails(setDoc(ref, pledgeDoc({ 0: entry(9) })));
        await assertSucceeds(deleteDoc(ref));
      }
    });

    it('denies a Pledge on a Request that does not exist', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(
        setDoc(doc(db, `${C}/itemRequests/nope/pledges/char:2`), pledgeDoc({ 0: entry(1) }))
      );
    });

    it('denies a wrong or missing communityId', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1) }, { communityId: 'c2' })));
      const { communityId: _drop, ...without } = pledgeDoc({ 0: entry(1) });
      void _drop;
      await assertFails(setDoc(doc(db, PLEDGE), without));
    });

    it('lets a Member change one line while another stands unchanged and stale', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), PLEDGE), {
          ownerHash: 'hash-2',
          communityId: 'c1',
          lines: { 0: entry(1), 1: entry(2) },
          updatedAt: new Date(Date.now() - 30 * DAY),
        });
      });
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertSucceeds(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1), 1: entry(8) })));
    });

    it('denies a departed Member and a transferred Character writing or withdrawing', async () => {
      const transferred = characterAuth(env, 2, 'hash-2-new-owner').firestore();
      await assertFails(
        setDoc(
          doc(transferred, PLEDGE),
          pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-2-new-owner' })
        )
      );
      await assertFails(deleteDoc(doc(transferred, PLEDGE)));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(doc(ctx.firestore(), MEMBER_2));
      });
      const departed = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(setDoc(doc(departed, PLEDGE), pledgeDoc({ 0: entry(1) })));
      await assertFails(deleteDoc(doc(departed, PLEDGE)));
    });

    describe('collection-group read by communityId', () => {
      const board = (
        db: ReturnType<typeof characterAuth>['firestore'] extends () => infer F ? F : never,
        id: string
      ) => getDocs(query(collectionGroup(db, 'pledges'), where('communityId', '==', id)));

      it('lets a Member read their own Community’s Pledges in one query', async () => {
        const db = characterAuth(env, 2, 'hash-2').firestore();
        await assertSucceeds(board(db, 'c1'));
      });

      it('denies a Member of another Community, a non-Member, a visitor and a transferred Character', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'communities/c2/members/char:3'), {
            ownerHash: 'hash-3',
            joinedAt: 1,
            characterName: 'Three',
          });
          await setDoc(doc(ctx.firestore(), 'communities/c2/itemRequests/x/pledges/char:3'), {
            ownerHash: 'hash-3',
            communityId: 'c2',
            lines: { 0: entry(1) },
            updatedAt: new Date(),
          });
        });
        await assertFails(board(characterAuth(env, 3, 'hash-3').firestore(), 'c1'));
        await assertSucceeds(board(characterAuth(env, 3, 'hash-3').firestore(), 'c2'));
        await assertFails(board(characterAuth(env, 4, 'hash-4').firestore(), 'c1'));
        await assertFails(board(env.unauthenticatedContext().firestore(), 'c1'));
        await assertFails(board(characterAuth(env, 2, 'hash-2-new-owner').firestore(), 'c1'));
      });

      it('denies an unfiltered query and one filtered to a Community the Member is not in', async () => {
        const db = characterAuth(env, 2, 'hash-2').firestore();
        await assertFails(getDocs(collectionGroup(db, 'pledges')));
        await assertFails(board(db, 'c2'));
      });
    });

    it('denies a malformed entry or document', async () => {
      const db = characterAuth(env, 2, 'hash-2').firestore();
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({})));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: { quantity: 1 } })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { extra: true }) })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { delivered: -1 }) })));
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { contractIds: 'a' }) })));
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1, { contractIds: new Array(21).fill(1) }) }))
      );
      await assertFails(setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1) }, { extra: 1 })));
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1) }, { updatedAt: new Date(5) }))
      );
      await assertFails(
        setDoc(doc(db, PLEDGE), pledgeDoc({ 0: entry(1) }, { ownerHash: 'hash-9' }))
      );
    });
  });

  it('lets a Member read their own day’s Request-mail count, even before the first mail', async () => {
    const db = characterAuth(env, 1, 'hash-1').firestore();
    await assertSucceeds(getDoc(doc(db, 'characters/char:1/requestMailQuota/2026-10-12')));
    await assertSucceeds(getDoc(doc(db, 'characters/char:1/requestMailQuota/2026-10-13')));
    const other = characterAuth(env, 2, 'hash-2').firestore();
    await assertFails(getDoc(doc(other, 'characters/char:1/requestMailQuota/2026-10-12')));
    await assertFails(
      setDoc(doc(db, 'characters/char:1/requestMailQuota/2026-10-12'), { count: 0 })
    );
  });

  it('keeps the per-Pledger mail records to the callables', async () => {
    for (const n of [1, 2]) {
      const db = characterAuth(env, n, `hash-${n}`).firestore();
      await assertFails(getDoc(doc(db, `${REQ}/pledgeMails/char:42`)));
      await assertFails(getDocs(collection(db, `${REQ}/pledgeMails`)));
      await assertFails(setDoc(doc(db, `${REQ}/pledgeMails/char:42`), { sentAt: 1 }));
    }
  });
});

describe('Fleet Payouts', () => {
  const PAYOUT = `${C}/fleetPayouts/p1`;
  const payout = {
    ownerUid: 'char:1',
    ownerName: 'One',
    name: 'Roam',
    totalIsk: 100,
    holdBackPct: 10,
    rule: 'equal',
    memberUids: ['char:2'],
    shareCount: 2,
    paidCount: 0,
    createdAt: 1,
    expiresAt: Date.now() + 86_400_000,
  };
  const share = (memberUid: string | null) => ({
    pilotName: 'Pilot',
    characterId: 5,
    memberUid,
    weight: 1,
    isk: 45,
    paid: false,
    paidAt: 0,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, PAYOUT), payout);
      await setDoc(doc(db, `${PAYOUT}/shares/0`), share('char:2'));
      await setDoc(doc(db, `${PAYOUT}/shares/1`), share(null));
    });
  });

  it('lets a Member read and list Payouts, and no outsider', async () => {
    const two = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDoc(doc(two, PAYOUT)));
    await assertSucceeds(getDocs(collection(two, `${C}/fleetPayouts`)));
    const outsider = characterAuth(env, 9, 'hash-9').firestore();
    await assertFails(getDoc(doc(outsider, PAYOUT)));
    await assertFails(getDocs(collection(outsider, `${C}/fleetPayouts`)));
    await assertFails(getDoc(doc(characterAuth(env, 2, 'wrong-hash').firestore(), PAYOUT)));
  });

  it('lets the boss list every Share', async () => {
    const one = characterAuth(env, 1, 'hash-1').firestore();
    const snap = await assertSucceeds(getDocs(collection(one, `${PAYOUT}/shares`)));
    expect(snap.size).toBe(2);
    await assertSucceeds(getDoc(doc(one, `${PAYOUT}/shares/1`)));
  });

  it('lets another Member read only their own Share', async () => {
    const two = characterAuth(env, 2, 'hash-2').firestore();
    await assertSucceeds(getDoc(doc(two, `${PAYOUT}/shares/0`)));
    await assertFails(getDoc(doc(two, `${PAYOUT}/shares/1`)));
    await assertFails(getDocs(collection(two, `${PAYOUT}/shares`)));
    const mine = await assertSucceeds(
      getDocs(query(collection(two, `${PAYOUT}/shares`), where('memberUid', '==', 'char:2')))
    );
    expect(mine.size).toBe(1);
    await assertFails(
      getDocs(query(collection(two, `${PAYOUT}/shares`), where('memberUid', '==', 'char:1')))
    );
  });

  it('keeps Shares from outsiders', async () => {
    const outsider = characterAuth(env, 9, 'hash-9').firestore();
    await assertFails(getDoc(doc(outsider, `${PAYOUT}/shares/0`)));
    await assertFails(
      getDocs(query(collection(outsider, `${PAYOUT}/shares`), where('memberUid', '==', 'char:9')))
    );
  });

  it('denies every client write, the boss included', async () => {
    for (const n of [1, 2]) {
      const db = characterAuth(env, n, `hash-${n}`).firestore();
      await assertFails(setDoc(doc(db, `${C}/fleetPayouts/new`), payout));
      await assertFails(updateDoc(doc(db, PAYOUT), { paidCount: 1 }));
      await assertFails(deleteDoc(doc(db, PAYOUT)));
      await assertFails(setDoc(doc(db, `${PAYOUT}/shares/9`), share(null)));
      await assertFails(updateDoc(doc(db, `${PAYOUT}/shares/0`), { paid: true }));
      await assertFails(deleteDoc(doc(db, `${PAYOUT}/shares/0`)));
    }
  });
});

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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
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

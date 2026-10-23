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

// SRP (issue #4848, ADR 0026). A mistake here lets a pilot read another corp's
// claims, lets a demoted officer keep reading the queue, or opens a write path.
let env: RulesTestEnvironment;

const CORP = 'corps/98000001';
const OTHER_CORP = 'corps/98000002';
const NOW = Date.now();
const officer = (overrides: Record<string, unknown> = {}) => ({
  characterId: 1,
  ownerHash: 'h1',
  corporationId: 98000001,
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
    await setDoc(doc(db, `${CORP}/srp/settings`), { enabled: true, corporationId: 98000001 });
    await setDoc(doc(db, `${OTHER_CORP}/srp/settings`), { enabled: true });
    await setDoc(doc(db, `${CORP}/srpOfficers/char:1`), officer());
    await setDoc(
      doc(db, `${CORP}/srpOfficers/char:4`),
      officer({ characterId: 4, ownerHash: 'h4', expiresAt: NOW - 1000 })
    );
    await setDoc(
      doc(db, `${CORP}/srpOfficers/char:5`),
      officer({ characterId: 5, ownerHash: 'h5', canEdit: false })
    );
    // The officer of another corporation: a valid record, but under the wrong corp.
    await setDoc(doc(db, `${OTHER_CORP}/srpOfficers/char:8`), officer({ characterId: 8 }));
    await setDoc(doc(db, `${CORP}/srpClaims/111`), { uid: 'char:2', killmailId: 111 });
    await setDoc(doc(db, `${CORP}/srpClaims/222`), { uid: 'char:3', killmailId: 222 });
    await setDoc(doc(db, `${OTHER_CORP}/srpClaims/333`), { uid: 'char:2', killmailId: 333 });
    await setDoc(doc(db, `${CORP}/srpAudit/e1`), { action: 'turnOn' });
  });
});

const OFFICER_ONLY = ['srp/settings', 'srpAudit/e1', 'srpClaims/111', 'srpClaims/222'];

describe('SRP rules', () => {
  it("lets a live officer read the corp's SRP data, and no other corp's", async () => {
    const db = characterAuth(env, 1, 'h1').firestore();
    for (const path of OFFICER_ONLY) await assertSucceeds(getDoc(doc(db, `${CORP}/${path}`)));
    await assertSucceeds(getDocs(collection(db, `${CORP}/srpClaims`)));
    await assertFails(getDoc(doc(db, `${OTHER_CORP}/srpClaims/333`)));
    await assertFails(getDoc(doc(db, `${OTHER_CORP}/srp/settings`)));
  });

  it('refuses an expired, view-only or other-corp officer, and a changed owner', async () => {
    for (const [id, hash] of [
      [4, 'h4'],
      [5, 'h5'],
      [1, 'other-owner'],
    ] as const) {
      const db = characterAuth(env, id, hash).firestore();
      for (const path of OFFICER_ONLY) await assertFails(getDoc(doc(db, `${CORP}/${path}`)));
      await assertFails(getDocs(collection(db, `${CORP}/srpClaims`)));
    }
    // A record in another corporation's officers does not open this one.
    const other = characterAuth(env, 8, 'h1').firestore();
    await assertFails(getDoc(doc(other, `${CORP}/srpClaims/111`)));
  });

  it('lets a pilot read only their own claims, by get and by a filtered query', async () => {
    const db = characterAuth(env, 2, 'h2').firestore();
    await assertSucceeds(getDoc(doc(db, `${CORP}/srpClaims/111`)));
    await assertFails(getDoc(doc(db, `${CORP}/srpClaims/222`)));
    await assertSucceeds(
      getDocs(query(collection(db, `${CORP}/srpClaims`), where('uid', '==', 'char:2')))
    );
    await assertFails(getDocs(collection(db, `${CORP}/srpClaims`)));
    await assertFails(
      getDocs(query(collection(db, `${CORP}/srpClaims`), where('uid', '==', 'char:3')))
    );
  });

  it('gives a pilot nothing but their own claims: no settings, audit or officer records', async () => {
    const db = characterAuth(env, 2, 'h2').firestore();
    await assertFails(getDoc(doc(db, `${CORP}/srp/settings`)));
    await assertFails(getDoc(doc(db, `${CORP}/srpAudit/e1`)));
    await assertFails(getDoc(doc(db, `${CORP}/srpOfficers/char:1`)));
    await assertFails(getDoc(doc(db, CORP)));
  });

  it('lets a Character read only their own officer record, under their own owner hash', async () => {
    await assertSucceeds(
      getDoc(doc(characterAuth(env, 1, 'h1').firestore(), `${CORP}/srpOfficers/char:1`))
    );
    await assertFails(
      getDoc(doc(characterAuth(env, 1, 'sold').firestore(), `${CORP}/srpOfficers/char:1`))
    );
    await assertFails(
      getDoc(doc(characterAuth(env, 5, 'h5').firestore(), `${CORP}/srpOfficers/char:1`))
    );
    await assertFails(
      getDocs(collection(characterAuth(env, 1, 'h1').firestore(), `${CORP}/srpOfficers`))
    );
  });

  it('denies every anonymous read', async () => {
    const db = env.unauthenticatedContext().firestore();
    for (const path of [...OFFICER_ONLY, 'srpOfficers/char:1']) {
      await assertFails(getDoc(doc(db, `${CORP}/${path}`)));
    }
  });

  it('denies every client write, officers and the claim owner included', async () => {
    for (const [id, hash] of [
      [1, 'h1'],
      [2, 'h2'],
    ] as const) {
      const db = characterAuth(env, id, hash).firestore();
      await assertFails(setDoc(doc(db, `${CORP}/srp/settings`), { enabled: false }));
      await assertFails(updateDoc(doc(db, `${CORP}/srp/settings`), { enabled: false }));
      await assertFails(setDoc(doc(db, `${CORP}/srpClaims/999`), { uid: `char:${id}` }));
      await assertFails(updateDoc(doc(db, `${CORP}/srpClaims/111`), { state: 'approved' }));
      await assertFails(deleteDoc(doc(db, `${CORP}/srpClaims/111`)));
      await assertFails(setDoc(doc(db, `${CORP}/srpAudit/x`), { action: 'forged' }));
      await assertFails(deleteDoc(doc(db, `${CORP}/srpAudit/e1`)));
      await assertFails(
        setDoc(doc(db, `${CORP}/srpOfficers/char:${id}`), officer({ characterId: id }))
      );
      await assertFails(setDoc(doc(db, CORP), { enabled: true }));
    }
  });
});

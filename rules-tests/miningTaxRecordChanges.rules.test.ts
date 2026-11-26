import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { characterAuth, createRulesEnv } from './testEnv';

let env: RulesTestEnvironment;

const PATH = 'characters/char:1/miningTaxRecordChanges';
const CHANGE = {
  id: 'tolerance:98000001:m1:2026-11-01',
  characterId: 1,
  reason: 'tolerance',
  at: '2026-11-02T10:00:00Z',
  date: '2026-11-01',
  corporationId: 98000001,
  minerId: 'm1',
  closeOut: { billed: 1_000_000, paid: 996_000, writtenOff: 4_000, tolerancePct: 0.5 },
  updatedAt: 1,
  ownerHash: 'hash-a',
  deleted: false,
};

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${PATH}/c1`), CHANGE);
  });
});

describe('characters/{uid}/miningTaxRecordChanges', () => {
  const owner = () => characterAuth(env, 1, 'hash-a').firestore();

  it('lets the owner read one and add another', async () => {
    await assertSucceeds(getDoc(doc(owner(), `${PATH}/c1`)));
    await assertSucceeds(setDoc(doc(owner(), `${PATH}/c2`), { ...CHANGE, id: 'c2' }));
  });

  it('lets a second device re-save the same change unchanged', async () => {
    await assertSucceeds(setDoc(doc(owner(), `${PATH}/c1`), { ...CHANGE, updatedAt: 2 }));
  });

  it('never lets a saved change be rewritten', async () => {
    await assertFails(
      setDoc(doc(owner(), `${PATH}/c1`), {
        ...CHANGE,
        closeOut: { ...CHANGE.closeOut, writtenOff: 9_000 },
        updatedAt: 2,
      })
    );
    await assertFails(setDoc(doc(owner(), `${PATH}/c1`), { ...CHANGE, reason: 'autoFix' }));
  });

  it('lets the owner tombstone or delete it', async () => {
    await assertSucceeds(
      setDoc(doc(owner(), `${PATH}/c1`), {
        id: 'c1',
        characterId: 1,
        updatedAt: 3,
        ownerHash: 'hash-a',
        deleted: true,
      })
    );
    await assertSucceeds(deleteDoc(doc(owner(), `${PATH}/c1`)));
  });

  it('denies another character and a forged ownerHash', async () => {
    const other = characterAuth(env, 2, 'hash-b').firestore();
    await assertFails(getDoc(doc(other, `${PATH}/c1`)));
    await assertFails(setDoc(doc(owner(), `${PATH}/c3`), { ...CHANGE, ownerHash: 'forged' }));
  });
});

// SRP officer actions against the Firestore emulator (issue #4853, ADR 0026). Runs only under the
// emulator (`npm run test:emulator`); a plain `npm test` skips it.
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import {
  parseApproveBatch,
  parseApproveItem,
  parseChangeAmount,
  parseReject,
} from './srpOfficer.js';
import {
  approveSrpClaim,
  approveSrpClaims,
  changeSrpClaimAmount,
  markSrpClaimPaid,
  markSrpClaimsPaid,
  rejectSrpClaim,
} from './srpOfficerStore.js';
import type { SrpDeps } from './srpStore.js';

const CORP = 98000001;
const T0 = Date.parse('2026-10-23T12:00:00Z');

let now = T0;
const identities = new Map<number, CorpIdentity>();

const deps = (): SrpDeps => ({
  db,
  now: () => now,
  verifyToken: async (token) => {
    const id = Number(/^tok-(\d+)$/.exec(token)?.[1]);
    if (!id) throw new Error('bad token');
    return {
      characterId: id,
      ownerHash: `h${id}`,
      name: `Pilot ${id}`,
      scopes: [ROLES_SCOPE],
      clientId: 'c',
    };
  },
  readIdentity: async (characterId) => {
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
  lookupCorporation: async () => CORP,
});

const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const call = (id: number) => parseBookCall({ corporationId: CORP, accessToken: `tok-${id}` });

const CEO = 1;
const DIRECTOR = 2;
const ACCOUNTANT = 3;
const JUNIOR = 4;
const PILOT = 5;
const OUTSIDER = 6;

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(((err as HttpsError).details as { reason?: string } | undefined)?.reason);
  }
  throw new Error('expected the call to fail');
}

const corp = () => db.collection('corps').doc(String(CORP));
const claimDoc = async (id: number) =>
  (await corp().collection('srpClaims').doc(String(id)).get()).data();
const audit = async () =>
  (await corp().collection('srpAudit').orderBy('at').get()).docs.map((d) => d.data());

async function seed(id: number, fields: Record<string, unknown> = {}) {
  await corp()
    .collection('srpClaims')
    .doc(String(id))
    .set({
      uid: 'char:50',
      ownerHash: 'h50',
      corporationId: CORP,
      killmailId: id,
      characterId: 50,
      characterName: 'Pilot Fifty',
      state: 'pending',
      amount: 1_000_000,
      basis: { step: 'hull-fixed' },
      refileCount: 0,
      ...fields,
    });
}

emulatorSuite('SRP officer actions (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identities.clear();
    identities.set(CEO, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: ['Director'] });
    identities.set(ACCOUNTANT, { corporationId: CORP, ceoId: CEO, roles: ['Accountant'] });
    identities.set(JUNIOR, { corporationId: CORP, ceoId: CEO, roles: ['Junior_Accountant'] });
    identities.set(PILOT, { corporationId: CORP, ceoId: CEO, roles: [] });
    identities.set(OUTSIDER, { corporationId: 98000999, ceoId: null, roles: ['Director'] });
  });

  const approve = (id: number, by = DIRECTOR, extra: Record<string, unknown> = {}) =>
    approveSrpClaim(deps(), who(by), call(by), parseApproveItem({ killmailId: id, ...extra }));

  it('approves for a Director, an Accountant and the CEO, and audits it', async () => {
    for (const [i, by] of [DIRECTOR, ACCOUNTANT, CEO].entries()) {
      await seed(10 + i);
      now = T0 + i;
      const out = await approve(10 + i, by);
      expect(out).toMatchObject({ state: 'approved', characterId: 50, amount: 1_000_000 });
    }
    expect(await claimDoc(10)).toMatchObject({ state: 'approved', decidedBy: DIRECTOR });
    expect(await claimDoc(10)).not.toHaveProperty('closedAt');
    const entries = await audit();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      by: DIRECTOR,
      action: 'approveClaim',
      detail: { killmailId: 10, amount: 1_000_000, pilotCharacterId: 50 },
    });
  });

  it('refuses a junior accountant, a plain pilot and an officer of another corp', async () => {
    await seed(1);
    expect(await reason(approve(1, JUNIOR))).toBe('not-an-officer');
    expect(await reason(approve(1, PILOT))).toBe('not-an-officer');
    expect(await reason(approve(1, OUTSIDER))).toBe('wrong-corp');
    expect(await claimDoc(1)).toMatchObject({ state: 'pending' });
    expect(await audit()).toHaveLength(0);
  });

  it('re-checks live: a demoted officer is refused on the next call', async () => {
    await seed(1);
    await seed(2);
    await approve(1);
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: [] });
    expect(await reason(approve(2))).toBe('not-an-officer');
    expect(await claimDoc(2)).toMatchObject({ state: 'pending' });
  });

  it('cannot reach another corp claim', async () => {
    await db.collection('corps').doc('98000999').collection('srpClaims').doc('7').set({
      state: 'pending',
      amount: 5,
    });
    expect(await reason(approve(7))).toBe('claim-not-found');
    expect(
      (await db.collection('corps').doc('98000999').collection('srpClaims').doc('7').get()).data()
    ).toMatchObject({ state: 'pending' });
  });

  it('refuses a second approval and every illegal transition', async () => {
    await seed(1);
    await approve(1);
    expect(await reason(approve(1))).toBe('illegal-transition');
    expect(
      await reason(
        rejectSrpClaim(
          deps(),
          who(DIRECTOR),
          call(DIRECTOR),
          parseReject({ killmailId: 1, reason: 'x' })
        )
      )
    ).toBe('illegal-transition');
    expect(
      await reason(markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 2 }))
    ).toBe('claim-not-found');
    await seed(3);
    expect(
      await reason(markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 3 }))
    ).toBe('illegal-transition');
    await markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 1 });
    expect(
      await reason(markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 1 }))
    ).toBe('illegal-transition');
    expect(await reason(approve(1))).toBe('illegal-transition');
    expect(await audit()).toHaveLength(2);
  });

  it('blocks an officer deciding their own claim, even as a batch; another officer may', async () => {
    await seed(1, { characterId: DIRECTOR, uid: `char:${DIRECTOR}` });
    expect(await reason(approve(1, DIRECTOR))).toBe('own-claim');
    expect(
      await reason(
        rejectSrpClaim(
          deps(),
          who(DIRECTOR),
          call(DIRECTOR),
          parseReject({ killmailId: 1, reason: 'x' })
        )
      )
    ).toBe('own-claim');
    expect(
      await reason(
        changeSrpClaimAmount(
          deps(),
          who(DIRECTOR),
          call(DIRECTOR),
          parseChangeAmount({ killmailId: 1, amount: 5, reason: 'x' })
        )
      )
    ).toBe('own-claim');
    const batch = await approveSrpClaims(
      deps(),
      who(DIRECTOR),
      call(DIRECTOR),
      parseApproveBatch({ claims: [{ killmailId: 1 }] })
    );
    expect(batch.results[0]).toMatchObject({ ok: false, reason: 'own-claim' });
    expect(await claimDoc(1)).toMatchObject({ state: 'pending', amount: 1_000_000 });
    expect(await audit()).toHaveLength(0);
    await approve(1, ACCOUNTANT);
    expect(
      await reason(markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 1 }))
    ).toBe('own-claim');
    expect(await claimDoc(1)).toMatchObject({ state: 'approved' });
  });

  it('refuses an approval or payment when the amount changed under the officer', async () => {
    await seed(1);
    await changeSrpClaimAmount(
      deps(),
      who(ACCOUNTANT),
      call(ACCOUNTANT),
      parseChangeAmount({ killmailId: 1, amount: 900_000, reason: 'fit' })
    );
    expect(await reason(approve(1, DIRECTOR, { expectedAmount: 1_000_000 }))).toBe(
      'amount-changed'
    );
    const batch = await approveSrpClaims(
      deps(),
      who(DIRECTOR),
      call(DIRECTOR),
      parseApproveBatch({ claims: [{ killmailId: 1, expectedAmount: 1_000_000 }] })
    );
    expect(batch.results[0]).toMatchObject({ ok: false, reason: 'amount-changed' });
    expect(await claimDoc(1)).toMatchObject({ state: 'pending' });
    await approve(1, DIRECTOR, { expectedAmount: 900_000 });
    // Approved amount is then changed under a second officer about to pay.
    await changeSrpClaimAmount(
      deps(),
      who(ACCOUNTANT),
      call(ACCOUNTANT),
      parseChangeAmount({ killmailId: 1, amount: 800_000, reason: 'again' })
    );
    expect(
      await reason(
        markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), {
          killmailId: 1,
          expectedAmount: 900_000,
        })
      )
    ).toBe('amount-changed');
    const paid = await markSrpClaimsPaid(deps(), who(DIRECTOR), call(DIRECTOR), [
      { killmailId: 1, expectedAmount: 800_000 },
    ]);
    expect(paid.results[0]).toMatchObject({ ok: true, state: 'paid', amount: 800_000 });
  });

  it('changes the amount of an approved claim without a new state or closedAt; not a paid one', async () => {
    await seed(1);
    await approve(1);
    now = T0 + 7;
    const out = await changeSrpClaimAmount(
      deps(),
      who(ACCOUNTANT),
      call(ACCOUNTANT),
      parseChangeAmount({ killmailId: 1, amount: 700_000, reason: 'bad fit' })
    );
    expect(out).toMatchObject({ state: 'approved', amount: 700_000 });
    const doc = await claimDoc(1);
    expect(doc).toMatchObject({ state: 'approved', amount: 700_000, computedAmount: 1_000_000 });
    expect(doc).not.toHaveProperty('closedAt');
    const last = (await audit()).at(-1);
    expect(last).toMatchObject({
      action: 'changeClaimAmount',
      detail: { from: 1_000_000, amount: 700_000, reason: 'bad fit' },
    });
    await markSrpClaimPaid(deps(), who(DIRECTOR), call(DIRECTOR), { killmailId: 1 });
    expect(
      await reason(
        changeSrpClaimAmount(
          deps(),
          who(ACCOUNTANT),
          call(ACCOUNTANT),
          parseChangeAmount({ killmailId: 1, amount: 1, reason: 'x' })
        )
      )
    ).toBe('illegal-transition');
  });

  it('two racing approvals: exactly one wins', async () => {
    await seed(1);
    const results = await Promise.allSettled([approve(1), approve(1, ACCOUNTANT)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await audit()).filter((e) => e.action === 'approveClaim')).toHaveLength(1);
  });

  it('rejects with a reason, sets closedAt and audits the reason; no reason is refused at parse', async () => {
    await seed(1);
    expect(() => parseReject({ killmailId: 1, reason: '' })).toThrow(HttpsError);
    expect(() => parseReject({ killmailId: 1 })).toThrow(HttpsError);
    now = T0 + 5000;
    const out = await rejectSrpClaim(
      deps(),
      who(ACCOUNTANT),
      call(ACCOUNTANT),
      parseReject({ killmailId: 1, reason: 'Not a fleet loss' })
    );
    expect(out).toMatchObject({ state: 'rejected', reason: 'Not a fleet loss', characterId: 50 });
    expect(await claimDoc(1)).toMatchObject({
      state: 'rejected',
      rejectionReason: 'Not a fleet loss',
      closedAt: T0 + 5000,
    });
    expect((await audit())[0]).toMatchObject({
      action: 'rejectClaim',
      detail: { reason: 'Not a fleet loss', killmailId: 1 },
    });
  });

  it('mark paid sets closedAt and the payer', async () => {
    await seed(1);
    await approve(1);
    now = T0 + 9000;
    const out = await markSrpClaimPaid(deps(), who(ACCOUNTANT), call(ACCOUNTANT), {
      killmailId: 1,
    });
    expect(out).toMatchObject({ state: 'paid', amount: 1_000_000, characterId: 50 });
    expect(await claimDoc(1)).toMatchObject({
      state: 'paid',
      closedAt: T0 + 9000,
      paidBy: ACCOUNTANT,
      paidAt: T0 + 9000,
    });
  });

  it('override: needs a reason, keeps the computed amount and audits who, from, to, why', async () => {
    await seed(1);
    expect(await reason(approve(1, DIRECTOR, { amount: 400_000 }))).toBe('reason-required');
    const out = await approve(1, DIRECTOR, { amount: 400_000, reason: 'Fit was cheap' });
    expect(out).toMatchObject({ amount: 400_000, reason: 'Fit was cheap' });
    expect(await claimDoc(1)).toMatchObject({
      state: 'approved',
      amount: 400_000,
      computedAmount: 1_000_000,
      amountSource: 'override',
      overrideReason: 'Fit was cheap',
      overrideBy: DIRECTOR,
    });
    expect((await audit())[0]).toMatchObject({
      by: DIRECTOR,
      action: 'approveClaim',
      detail: { amount: 400_000, computedAmount: 1_000_000, reason: 'Fit was cheap' },
    });
  });

  it('change amount keeps the claim pending, then approve uses it', async () => {
    await seed(1);
    await changeSrpClaimAmount(
      deps(),
      who(DIRECTOR),
      call(DIRECTOR),
      parseChangeAmount({ killmailId: 1, amount: 700_000, reason: 'Missing mods' })
    );
    expect(await claimDoc(1)).toMatchObject({
      state: 'pending',
      amount: 700_000,
      computedAmount: 1_000_000,
    });
    expect((await audit())[0]).toMatchObject({
      action: 'changeClaimAmount',
      detail: { from: 1_000_000, amount: 700_000, reason: 'Missing mods' },
    });
    expect(await approve(1)).toMatchObject({ amount: 700_000 });
  });

  it('refuses to approve a claim with no amount unless one is typed', async () => {
    await seed(1, { amount: null, basis: null });
    expect(await reason(approve(1))).toBe('amount-required');
    expect(await approve(1, DIRECTOR, { amount: 50_000_000 })).toMatchObject({
      amount: 50_000_000,
    });
    expect(await claimDoc(1)).toMatchObject({ amountSource: 'typed', computedAmount: null });
  });

  it('batches give a result per claim and let the good ones through', async () => {
    await seed(1);
    await seed(2, { amount: null });
    await seed(3, { state: 'rejected' });
    const out = await approveSrpClaims(
      deps(),
      who(DIRECTOR),
      call(DIRECTOR),
      parseApproveBatch({
        claims: [{ killmailId: 1 }, { killmailId: 2 }, { killmailId: 3 }, { killmailId: 4 }],
      })
    );
    expect(out.results.map((r) => (r.ok ? 'ok' : r.reason))).toEqual([
      'ok',
      'amount-required',
      'illegal-transition',
      'claim-not-found',
    ]);
    const paid = await markSrpClaimsPaid(deps(), who(DIRECTOR), call(DIRECTOR), [
      { killmailId: 1 },
      { killmailId: 2 },
    ]);
    expect(paid.results.map((r) => (r.ok ? r.state : r.reason))).toEqual([
      'paid',
      'illegal-transition',
    ]);
    expect((await audit()).map((e) => e.action).sort()).toEqual(['approveClaim', 'markClaimPaid']);
  });

  it('a batch by a demoted officer fails whole', async () => {
    await seed(1);
    identities.set(DIRECTOR, { corporationId: CORP, ceoId: CEO, roles: [] });
    expect(
      await reason(
        approveSrpClaims(
          deps(),
          who(DIRECTOR),
          call(DIRECTOR),
          parseApproveBatch({ claims: [{ killmailId: 1 }] })
        )
      )
    ).toBe('not-an-officer');
  });

  it('a re-filed claim after rejection can be decided again', async () => {
    await seed(1, { state: 'pending', refileCount: 1, previousRejectionReason: 'r' });
    expect(await approve(1)).toMatchObject({ state: 'approved' });
  });
});

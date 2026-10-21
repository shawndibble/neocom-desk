// Corp Tax Book callables against the Firestore emulator (issue #4061). Runs
// only under `npm run test:rules` at the repo root (which starts the emulator
// and sets FIRESTORE_EMULATOR_HOST); a plain `npm test` skips it.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseBookCall, parseEditAction, parseSyncInput, parseTurnOnInput } from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import {
  claimPayment,
  deleteBook,
  confirmGrouping,
  declineGrouping,
  declineGroupingByToken,
  editBook,
  listPendingGroupings,
  readStatementByToken,
  reclaimBook,
  setRemindersByToken,
  syncBook,
  turnOnBook,
  verifyOfficer,
  type BookDeps,
  type Caller,
} from './corpTaxBookStore.js';

const CORP = 98000001;
const T0 = Date.parse('2026-10-18T12:00:00Z');

const runnable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runnable ? describe : describe.skip;

let db: Firestore;
let now = T0;
const identities = new Map<number, CorpIdentity>();
let identityCalls = 0;

const deps = (): BookDeps => ({
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
    identityCalls += 1;
    const identity = identities.get(characterId);
    if (!identity) throw new Error('no identity');
    return identity;
  },
});

const who = (id: number): Caller => ({ uid: `char:${id}`, ownerHash: `h${id}` });
const withToken = (id: number) => ({ corporationId: CORP, accessToken: `tok-${id}` });
const as = (roles: string[], ceo = false): CorpIdentity => ({
  corporationId: CORP,
  ceoId: ceo ? 1 : null,
  roles,
});

const DIRECTOR = 1;
const ACCOUNTANT = 2;
const JUNIOR = 3;
const OUTSIDER = 4;

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return String(
      (err as HttpsError).details && ((err as HttpsError).details as { reason?: string }).reason
    );
  }
  throw new Error('expected the call to fail');
}

const edit = (id: number, data: Record<string, unknown>, token = false) =>
  editBook(deps(), who(id), token ? withToken(id) : { corporationId: CORP }, parseEditAction(data));

const book = () => db.collection('corpTaxBooks').doc(String(CORP));
const auditCount = async () => (await book().collection('audit').get()).size;

const statement = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  minerId: 'solo:50',
  code: 'ABC123',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  coversFrom: '2026-10-01',
  coversThrough: '2026-10-31',
  issuedAt: '2026-11-01T00:00:00.000Z',
  hubId: 'jita',
  oreForm: 'compressed',
  lines: [
    { kind: 'mined', date: '2026-10-05', characterId: 50, oreLines: [], estimatedValue: 1, tax: 1 },
  ],
  amount: 10_000_000,
  characterIds: [50],
  ...overrides,
});

const row = (quantity: number, cachedAt: string, overrides: Record<string, unknown> = {}) => ({
  structureId: 1000,
  characterId: 50,
  recordedCorporationId: CORP,
  typeId: 45490,
  date: '2026-10-17',
  quantity,
  cachedAt,
  ...overrides,
});

if (runnable) {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-neocom-rules' });
  db = getFirestore();
}

/** The emulator's own wipe: BulkWriter-based recursiveDelete trips its rate limiter here. */
async function clearEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(
    `http://${host}/emulator/v1/projects/demo-neocom-rules/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

suite('Corp Tax Book callables (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identityCalls = 0;
    identities.clear();
    identities.set(DIRECTOR, as(['Director']));
    identities.set(ACCOUNTANT, as(['Accountant', 'Station_Manager']));
    identities.set(JUNIOR, as(['Junior_Accountant']));
    identities.set(OUTSIDER, { corporationId: 98000999, ceoId: null, roles: ['Director'] });
  });

  async function turnOn() {
    await turnOnBook(
      deps(),
      who(DIRECTOR),
      parseTurnOnInput({ ...withToken(DIRECTOR), startDate: '2026-10-01', startRatePct: 10 })
    );
    // The other officers record their access.
    for (const id of [ACCOUNTANT, JUNIOR]) {
      await verifyOfficer(deps(), who(id), parseBookCall(withToken(id)));
    }
  }

  describe('verifyOfficer', () => {
    it('records access for 24h and stores no token', async () => {
      await turnOn();
      const doc = (await book().collection('officers').doc(`char:${ACCOUNTANT}`).get()).data();
      expect(doc).toMatchObject({
        canEdit: true,
        canView: true,
        checkedAt: T0,
        expiresAt: T0 + 24 * 3_600_000,
      });
      expect(JSON.stringify(doc)).not.toContain('tok-');
    });

    it('refuses someone from another corporation, or with no officer role', async () => {
      await turnOn();
      expect(
        await reason(verifyOfficer(deps(), who(OUTSIDER), parseBookCall(withToken(OUTSIDER))))
      ).toBe('wrong-corp');
      identities.set(5, as([]));
      expect(await reason(verifyOfficer(deps(), who(5), parseBookCall(withToken(5))))).toBe(
        'not-an-officer'
      );
      // A failed renewal revokes the access the old check granted.
      now = T0 + 11 * 60_000;
      identities.set(JUNIOR, as([]));
      expect(
        await reason(verifyOfficer(deps(), who(JUNIOR), parseBookCall(withToken(JUNIOR))))
      ).toBe('not-an-officer');
      expect((await book().collection('officers').doc(`char:${JUNIOR}`).get()).exists).toBe(false);
    });

    it('rejects a token for another Character', async () => {
      await turnOn();
      const call = { corporationId: CORP, accessToken: `tok-${ACCOUNTANT}` };
      expect(await reason(verifyOfficer(deps(), who(JUNIOR), parseBookCall(call)))).toBe(
        'token-mismatch'
      );
    });

    it('reuses a check younger than 10 minutes and re-reads ESI after', async () => {
      await turnOn();
      identityCalls = 0;
      now = T0 + 9 * 60_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(identityCalls).toBe(0);
      now = T0 + 11 * 60_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(identityCalls).toBe(1);
    });
  });

  describe('turning the book on', () => {
    it('needs a Director, sets the defaults and the dated start rate, and logs it', async () => {
      expect(
        await reason(
          turnOnBook(
            deps(),
            who(ACCOUNTANT),
            parseTurnOnInput({
              ...withToken(ACCOUNTANT),
              startDate: '2026-10-01',
              startRatePct: 10,
            })
          )
        )
      ).toBe('role-required');
      await turnOn();
      expect((await book().get()).data()).toMatchObject({
        active: true,
        startDate: '2026-10-01',
        hubId: 'jita',
        oreForm: 'compressed',
        graceHours: 6,
        minimumStatement: 5_000_000,
        overdueDays: 14,
        divisions: [1],
        rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
      });
      expect(await auditCount()).toBeGreaterThanOrEqual(1);
      expect(
        await reason(
          turnOnBook(
            deps(),
            who(DIRECTOR),
            parseTurnOnInput({ ...withToken(DIRECTOR), startDate: '2026-10-01', startRatePct: 5 })
          )
        )
      ).toBe('book-exists');
    });
  });

  describe('sync', () => {
    const sync = (id: number, extra: Record<string, unknown>) =>
      syncBook(deps(), who(id), parseSyncInput({ corporationId: CORP, ...extra }, now));

    it('upserts monotonically and ignores an older ESI cache', async () => {
      await turnOn();
      await sync(ACCOUNTANT, { observed: [row(100, '2026-10-18T10:00:00Z')] });
      await sync(ACCOUNTANT, { observed: [row(50, '2026-10-18T11:00:00Z')] });
      const id = '50_45490_2026-10-17_1000';
      const read = async () => (await book().collection('observed').doc(id).get()).data();
      expect(await read()).toMatchObject({ quantity: 100, uid: 'char:50' });
      await sync(ACCOUNTANT, { observed: [row(500, '2026-10-18T09:00:00Z')] });
      expect((await read())?.quantity).toBe(100);
      const result = await sync(ACCOUNTANT, { observed: [row(300, '2026-10-18T11:30:00Z')] });
      expect(result.observedChanged).toBe(1);
      expect((await read())?.quantity).toBe(300);
      expect((await book().get()).get('lastSync')).toMatchObject({ byCharacterId: ACCOUNTANT });
    });

    it('points each observed Character at the book, refreshed on every sync', async () => {
      await turnOn();
      await sync(ACCOUNTANT, { observed: [row(100, '2026-10-18T10:00:00Z')] });
      const pointer = db.collection('corpTaxBookBilledBy').doc('char:50');
      const first = (await pointer.get()).get(`books.${CORP}`);
      expect(first).toEqual(expect.any(Number));
      await sync(ACCOUNTANT, { observed: [row(100, '2026-10-18T10:00:00Z')] });
      expect((await pointer.get()).get(`books.${CORP}`)).toBeGreaterThanOrEqual(first);
    });

    it('needs an editor, and Station_Manager for extractions', async () => {
      await turnOn();
      expect(await reason(sync(JUNIOR, { observed: [row(1, '2026-10-18T10:00:00Z')] }))).toBe(
        'role-required'
      );
      const extraction = {
        structureId: 1000,
        moonId: 7,
        extractionStartTime: '2026-10-10T00:00:00Z',
        chunkArrivalTime: '2026-10-17T00:00:00Z',
        naturalDecayTime: '2026-10-17T03:00:00Z',
      };
      identities.set(ACCOUNTANT, as(['Accountant']));
      now = T0 + 11 * 60_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(await reason(sync(ACCOUNTANT, { extractions: [extraction] }))).toBe(
        'station-manager-required'
      );
      identities.set(ACCOUNTANT, as(['Accountant', 'Station_Manager']));
      now = T0 + 25 * 60_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      await sync(ACCOUNTANT, { extractions: [extraction] });
      expect((await book().collection('extractions').get()).size).toBe(1);
    });

    it('adds a donation once and never undoes a "not tax" mark', async () => {
      await turnOn();
      const donation = {
        refId: 99,
        division: 1,
        characterId: 50,
        amount: 1_000_000,
        at: '2026-10-17T00:00:00Z',
      };
      await sync(ACCOUNTANT, { donations: [donation] });
      await edit(
        DIRECTOR,
        { action: 'markNotTax', paymentId: 'j1_99', notTaxAmount: 400_000, reason: 'buyback' },
        true
      );
      const again = await sync(ACCOUNTANT, { donations: [donation] });
      expect(again.donationsAdded).toBe(0);
      expect((await book().collection('payments').doc('j1_99').get()).data()).toMatchObject({
        notTaxAmount: 400_000,
      });
    });
  });

  describe('edits', () => {
    it('refuses a view-only officer and a stale cache without a token', async () => {
      await turnOn();
      expect(
        await reason(edit(JUNIOR, { action: 'updateSettings', patch: { minimumStatement: 1 } }))
      ).toBe('role-required');
      now = T0 + 11 * 60_000;
      expect(
        await reason(edit(ACCOUNTANT, { action: 'updateSettings', patch: { minimumStatement: 1 } }))
      ).toBe('officer-check-stale');
    });

    it('lets any editor change the minimum Statement and settings, and logs it', async () => {
      await turnOn();
      const before = await auditCount();
      await edit(ACCOUNTANT, {
        action: 'updateSettings',
        patch: { minimumStatement: 2_000_000, graceHours: 12 },
      });
      expect((await book().get()).data()).toMatchObject({
        minimumStatement: 2_000_000,
        graceHours: 12,
      });
      expect(await auditCount()).toBe(before + 1);
    });

    it('never makes a rate retroactive, and only on a day not yet on a Statement for a record rate', async () => {
      await turnOn();
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'addRate',
            rate: { scope: 'corp', pct: 20, effectiveFrom: '2026-10-17' },
          })
        )
      ).toBe('retroactive-rate');
      await edit(ACCOUNTANT, {
        action: 'addRate',
        rate: { scope: 'guest', pct: 25, effectiveFrom: '2026-10-18' },
      });
      await edit(ACCOUNTANT, {
        action: 'setRecordRate',
        recordKey: '50:1000:2026-10-05',
        pct: 0,
        reason: 'fix',
      });
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'setRecordRate',
            recordKey: '50:1000:2026-10-05',
            pct: 3,
            reason: 'late',
          })
        )
      ).toBe('day-on-statement');
      expect((await book().get()).get('rates')).toHaveLength(3);
    });

    it('re-checks the role live for dismiss, write-off, rebill and not tax', async () => {
      await turnOn();
      const dismiss = {
        action: 'dismiss',
        scope: 'record',
        targetId: '50:1000:2026-10-05',
        reason: 'event',
      };
      expect(await reason(edit(ACCOUNTANT, dismiss))).toBe('live-check-required');
      // Demoted in game within the 10-minute cache: the live check catches it.
      identities.set(ACCOUNTANT, as(['Junior_Accountant']));
      expect(await reason(edit(ACCOUNTANT, dismiss, true))).toBe('role-required');
      identities.set(ACCOUNTANT, as(['Accountant']));
      const out = await edit(ACCOUNTANT, dismiss, true);
      expect(out.dismissalId).toBeTruthy();
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'writeOff', minerId: 'solo:50', amount: 5, reason: 'left' })
        )
      ).toBe('live-check-required');
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'rebill',
            minerId: 'solo:50',
            fromDate: '2026-10-05',
            reason: 'x',
          })
        )
      ).toBe('live-check-required');
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'markNotTax', paymentId: 'p', notTaxAmount: 1, reason: 'x' })
        )
      ).toBe('live-check-required');
      await edit(
        ACCOUNTANT,
        { action: 'reverseDismissal', dismissalId: out.dismissalId, reason: 'oops' },
        true
      );
      const d = (await book().collection('dismissals').doc(String(out.dismissalId)).get()).data();
      expect(d).toMatchObject({ uids: ['char:50'], reversed: { by: ACCOUNTANT } });
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            { action: 'reverseDismissal', dismissalId: out.dismissalId, reason: 'again' },
            true
          )
        )
      ).toBe('already-reversed');
    });

    it('asks a Director above the dismissal approval limit', async () => {
      await turnOn();
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: null } })
        )
      ).toBe('director-approval');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 1000 } });
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            { action: 'dismiss', scope: 'miner', targetId: 'solo:50', reason: 'x' },
            true
          )
        )
      ).toBe('director-approval');
      const big = {
        action: 'dismiss',
        scope: 'miner',
        targetId: 'solo:50',
        reason: 'x',
        amountIsk: 5000,
      };
      expect(await reason(edit(ACCOUNTANT, big, true))).toBe('director-approval');
      await edit(DIRECTOR, big, true);
    });

    it('dismisses several days at once, skipping days already dismissed', async () => {
      await turnOn();
      const day = (d: string) => `50:1000:${d}`;
      await edit(
        ACCOUNTANT,
        { action: 'dismiss', scope: 'record', targetId: day('2026-10-05'), reason: 'event' },
        true
      );
      const out = await edit(
        ACCOUNTANT,
        {
          action: 'dismissRecords',
          targets: [
            { targetId: day('2026-10-05'), amountIsk: 10 },
            { targetId: day('2026-10-06'), amountIsk: 20 },
          ],
          reason: 'event',
        },
        true
      );
      expect(out.skipped).toEqual([day('2026-10-05')]);
      expect(out.dismissalIds).toHaveLength(1);
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            {
              action: 'dismissRecords',
              targets: [{ targetId: day('2026-10-06'), amountIsk: 20 }],
              reason: 'again',
            },
            true
          )
        )
      ).toBe('already-dismissed');
      // A reversed dismissal no longer covers the day.
      const first = (await book().collection('dismissals').get()).docs.find(
        (d) => d.get('targetId') === day('2026-10-05')
      )!;
      await edit(
        ACCOUNTANT,
        { action: 'reverseDismissal', dismissalId: first.id, reason: 'oops' },
        true
      );
      const again = await edit(
        ACCOUNTANT,
        {
          action: 'dismissRecords',
          targets: [{ targetId: day('2026-10-05'), amountIsk: 10 }],
          reason: 'back',
        },
        true
      );
      expect(again.skipped).toEqual([]);
    });

    it('checks the approval limit on what a multi-day dismissal actually dismisses', async () => {
      await turnOn();
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 100 } });
      const day = (d: string) => `50:1000:${d}`;
      await edit(
        DIRECTOR,
        {
          action: 'dismiss',
          scope: 'record',
          targetId: day('2026-10-05'),
          reason: 'x',
          amountIsk: 90,
        },
        true
      );
      // 90 + 60 is over the limit, but the 90 is already dismissed, so only 60 counts.
      const out = await edit(
        ACCOUNTANT,
        {
          action: 'dismissRecords',
          targets: [
            { targetId: day('2026-10-05'), amountIsk: 90 },
            { targetId: day('2026-10-06'), amountIsk: 60 },
          ],
          reason: 'x',
        },
        true
      );
      expect(out.skipped).toEqual([day('2026-10-05')]);
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            {
              action: 'dismissRecords',
              targets: [
                { targetId: day('2026-10-07'), amountIsk: 60 },
                { targetId: day('2026-10-08'), amountIsk: 60 },
              ],
              reason: 'x',
            },
            true
          )
        )
      ).toBe('director-approval');
    });

    it('regroups atomically: absorbed groups dissolve, a refusal changes nothing', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-b',
        characterIds: [62, 63],
        mainCharacterId: 62,
      });
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-c',
        characterIds: [64, 65],
        mainCharacterId: 64,
      });
      // m-c is not fully inside the new group: nothing may change.
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'regroupMiner',
            minerId: 'solo:60',
            characterIds: [60, 62, 63, 64],
            mainCharacterId: 60,
            absorbMinerIds: ['m-b', 'm-c'],
          })
        )
      ).toBe('regroup-incomplete');
      expect((await book().collection('miners').doc('m-b').get()).exists).toBe(true);
      expect((await book().collection('miners').doc('solo:60').get()).exists).toBe(false);
      await edit(ACCOUNTANT, {
        action: 'regroupMiner',
        minerId: 'solo:60',
        characterIds: [60, 62, 63],
        mainCharacterId: 62,
        absorbMinerIds: ['m-b'],
      });
      expect((await book().collection('miners').doc('m-b').get()).exists).toBe(false);
      expect((await book().collection('miners').doc('solo:60').get()).data()).toMatchObject({
        characterIds: [60, 62, 63],
        mainCharacterId: 62,
        pendingConfirmation: [],
      });
    });

    it('holds a guest added by a regroup until they confirm', async () => {
      await turnOn();
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            observed: [
              row(11, '2026-10-18T10:00:00Z', { characterId: 61, recordedCorporationId: 555 }),
            ],
          },
          now
        )
      );
      const out = await edit(ACCOUNTANT, {
        action: 'regroupMiner',
        minerId: 'm-a',
        characterIds: [60, 61],
        mainCharacterId: 60,
        absorbMinerIds: [],
      });
      expect(out.pendingConfirmation).toEqual([61]);
      expect((await book().collection('miners').doc('m-a').get()).get('uids')).toEqual(['char:60']);
    });

    it('records an unlinked character in the book so every sync leaves it alone', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-a',
        characterIds: [60, 61],
        mainCharacterId: 60,
      });
      await edit(ACCOUNTANT, { action: 'unlink', minerId: 'm-a', characterId: 61 });
      const declined = () => book().collection('meta').doc('declinedAutoGroup').get();
      expect((await declined()).get('ids')).toEqual([61]);
      // Grouping it on purpose lifts the mark.
      await edit(ACCOUNTANT, {
        action: 'regroupMiner',
        minerId: 'm-a',
        characterIds: [60, 61],
        mainCharacterId: 60,
        absorbMinerIds: [],
      });
      expect((await declined()).get('ids')).toEqual([]);
    });

    it('records manual payments and assigns Unmatched ones', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'm1',
        minerId: 'solo:50',
        characterId: 50,
        amount: 2_000_000,
        at: '2026-10-18T00:00:00Z',
      });
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'recordPayment',
            paymentId: 'm1',
            minerId: 'solo:50',
            characterId: 50,
            amount: 1,
            at: '2026-10-18T00:00:00Z',
          })
        )
      ).toBe('payment-exists');
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            donations: [
              { refId: 5, division: 1, characterId: 77, amount: 10, at: '2026-10-18T00:00:00Z' },
            ],
          },
          now
        )
      );
      await edit(ACCOUNTANT, { action: 'assignPayment', paymentId: 'j1_5', minerId: 'solo:77' });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'assignPayment', paymentId: 'j1_5', minerId: 'solo:78' })
        )
      ).toBe('already-assigned');
    });

    it('lets a player claim only their own Unmatched donation, audited', async () => {
      await turnOn();
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            donations: [
              { refId: 7, division: 1, characterId: 77, amount: 10, at: '2026-10-18T00:00:00Z' },
            ],
          },
          now
        )
      );
      // Someone else's donation looks exactly like a missing one.
      expect(await reason(claimPayment(deps(), who(78), CORP, 'j1_7'))).toBe('not-found');
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j1_404'))).toBe('not-found');
      const before = await auditCount();
      expect(await claimPayment(deps(), who(77), CORP, 'j1_7')).toEqual({ minerId: 'solo:77' });
      expect((await book().collection('payments').doc('j1_7').get()).data()).toMatchObject({
        minerId: 'solo:77',
        claimedBy: 77,
      });
      expect(await auditCount()).toBe(before + 1);
      const entry = (await book().collection('audit').where('action', '==', 'claimPayment').get())
        .docs[0];
      expect(entry.data()).toMatchObject({
        action: 'claimPayment',
        by: 77,
        via: 'player-claim',
        detail: { paymentId: 'j1_7', minerId: 'solo:77' },
      });
      expect(entry.data()).toMatchObject({ byName: 'Player claim' });
      // Claimed once; an officer's assignment cannot be overridden by a second claim.
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j1_7'))).toBe('already-assigned');
    });

    it('credits a claim to the Miner the character is grouped into', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-a',
        characterIds: [60, 77],
        mainCharacterId: 60,
      });
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            donations: [
              { refId: 8, division: 1, characterId: 77, amount: 10, at: '2026-10-18T00:00:00Z' },
            ],
          },
          now
        )
      );
      expect(await claimPayment(deps(), who(77), CORP, 'j1_8')).toEqual({ minerId: 'm-a' });
    });

    it('refuses a claim when the corporation has no book', async () => {
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j1_7'))).toBe('no-book');
    });

    it('groups characters, holds a guest until they confirm, and unlinks', async () => {
      await turnOn();
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            observed: [
              row(10, '2026-10-18T10:00:00Z', { characterId: 61, recordedCorporationId: 555 }),
            ],
          },
          now
        )
      );
      const out = await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-a',
        characterIds: [60, 61],
        mainCharacterId: 60,
      });
      expect(out.pendingConfirmation).toEqual([61]);
      expect((await book().collection('miners').doc('m-a').get()).get('uids')).toEqual(['char:60']);
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'setMiner',
            minerId: 'm-b',
            characterIds: [61, 62],
            mainCharacterId: 62,
          })
        )
      ).toBe('already-grouped');
      await confirmGrouping(deps(), who(61), CORP, 'm-a');
      expect((await book().collection('miners').doc('m-a').get()).get('uids').sort()).toEqual([
        'char:60',
        'char:61',
      ]);
      expect((await book().collection('miners').doc('m-a').get()).data()).toMatchObject({
        pendingConfirmation: [],
        confirmedCharacterIds: [61],
      });
      await edit(ACCOUNTANT, { action: 'unlink', minerId: 'm-a', characterId: 61 });
      expect((await book().collection('miners').doc('m-a').get()).exists).toBe(false);
    });

    describe('a guest answering a hand-made grouping (#4210)', () => {
      const pendingGuest = async () => {
        await turnOn();
        await syncBook(
          deps(),
          who(ACCOUNTANT),
          parseSyncInput(
            {
              corporationId: CORP,
              observed: [
                row(10, '2026-10-18T10:00:00Z', { characterId: 61, recordedCorporationId: 555 }),
              ],
            },
            now
          )
        );
        await edit(ACCOUNTANT, {
          action: 'setMiner',
          minerId: 'm-a',
          characterIds: [60, 61],
          mainCharacterId: 60,
        });
      };
      const answers = async () =>
        (await book().collection('meta').doc('groupingAnswers').get()).get('answers');
      const miner = () => book().collection('miners').doc('m-a').get();

      it('shows the officers a confirmation after the fact', async () => {
        await pendingGuest();
        await confirmGrouping(deps(), who(61), CORP, 'm-a');
        expect((await answers())['61']).toMatchObject({
          minerId: 'm-a',
          answer: 'confirmed',
          via: 'character',
        });
      });

      it('lets the added character decline, which removes it and tells the officers', async () => {
        await pendingGuest();
        await declineGrouping(deps(), who(61), CORP, 'm-a');
        expect((await miner()).exists).toBe(false);
        expect((await answers())['61']).toMatchObject({ answer: 'declined', via: 'character' });
        const declined = await book().collection('meta').doc('declinedAutoGroup').get();
        expect(declined.get('ids')).toEqual([61]);
        const audit = (await book().collection('audit').get()).docs.map((d) => d.get('action'));
        expect(audit).toContain('declineGrouping');
      });

      it('lets the verify link decline but never confirm, and the officer can ask again', async () => {
        await pendingGuest();
        await edit(ACCOUNTANT, {
          action: 'issueStatement',
          statement: statement('s1', { minerId: 'm-a', characterIds: [60] }),
        });
        const token = String(
          (await book().collection('statementLinks').doc('s1').get()).get('verifyToken')
        );
        const view = await readStatementByToken(deps(), token);
        expect(view.pendingCharacterIds).toEqual([61]);
        // Another Miner's character cannot be declined with this link.
        expect(await reason(declineGroupingByToken(deps(), token, 60))).toBe('nothing-pending');
        await declineGroupingByToken(deps(), token, 61);
        expect((await miner()).exists).toBe(false);
        expect((await answers())['61']).toMatchObject({ answer: 'declined', via: 'verify-link' });
        await edit(ACCOUNTANT, {
          action: 'setMiner',
          minerId: 'm-a',
          characterIds: [60, 61],
          mainCharacterId: 60,
        });
        expect((await answers())['61']).toBeUndefined();
      });

      it('forgets a confirmation when an officer unlinks the character', async () => {
        await pendingGuest();
        await confirmGrouping(deps(), who(61), CORP, 'm-a');
        expect((await answers())['61']).toMatchObject({ answer: 'confirmed' });
        await edit(ACCOUNTANT, { action: 'unlink', minerId: 'm-a', characterId: 61 });
        expect((await answers())['61']).toBeUndefined();
      });

      it('keeps a confirmation when an officer regroups a Miner that still holds the character', async () => {
        await pendingGuest();
        await confirmGrouping(deps(), who(61), CORP, 'm-a');
        await edit(ACCOUNTANT, {
          action: 'regroupMiner',
          minerId: 'm-a',
          characterIds: [60, 61, 63],
          mainCharacterId: 60,
          absorbMinerIds: [],
        });
        expect((await answers())['61']).toMatchObject({ answer: 'confirmed' });
      });

      it('refuses a decline once the Miner account is closed, and keeps the Miner', async () => {
        await pendingGuest();
        await edit(ACCOUNTANT, {
          action: 'closeAccount',
          minerId: 'm-a',
          reason: 'Guest left the area',
          credit: { kind: 'refund' },
          statement: statement('final_m-a', { minerId: 'm-a', characterIds: [60] }),
        });
        expect(await reason(declineGrouping(deps(), who(61), CORP, 'm-a'))).toBe('account-closed');
        expect((await miner()).get('closedAt')).toBe(new Date(T0).toISOString());
      });

      it('forgets an answer when an officer regroups the character', async () => {
        await pendingGuest();
        await declineGrouping(deps(), who(61), CORP, 'm-a');
        expect((await answers())['61']).toMatchObject({ answer: 'declined' });
        await edit(ACCOUNTANT, {
          action: 'regroupMiner',
          minerId: 'm-b',
          characterIds: [61, 62],
          mainCharacterId: 62,
          absorbMinerIds: [],
        });
        expect((await answers())['61']).toBeUndefined();
      });

      it('takes a deliberately added character off the keep-out list', async () => {
        await pendingGuest();
        await declineGrouping(deps(), who(61), CORP, 'm-a');
        const declined = () => book().collection('meta').doc('declinedAutoGroup').get();
        expect((await declined()).get('ids')).toEqual([61]);
        await edit(ACCOUNTANT, {
          action: 'setMiner',
          minerId: 'm-a',
          characterIds: [60, 61],
          mainCharacterId: 60,
        });
        expect((await declined()).get('ids')).toEqual([]);
      });

      it('refuses a confirm or decline from any character but the added one', async () => {
        await pendingGuest();
        for (const other of [60, 62, ACCOUNTANT]) {
          expect(await reason(confirmGrouping(deps(), who(other), CORP, 'm-a'))).toBe(
            'nothing-pending'
          );
          expect(await reason(declineGrouping(deps(), who(other), CORP, 'm-a'))).toBe(
            'nothing-pending'
          );
        }
        expect(
          await reason(confirmGrouping(deps(), { uid: 'someone', ownerHash: 'x' }, CORP, 'm-a'))
        ).toBe('not-signed-in');
        expect((await miner()).get('pendingConfirmation')).toEqual([61]);
        expect((await miner()).get('uids')).toEqual(['char:60']);
        expect(await answers()).toBeUndefined();
      });

      it('lists the groupings waiting for the signed-in character only', async () => {
        await pendingGuest();
        // Not while the book is still in its member setup window.
        expect(await listPendingGroupings(deps(), who(61))).toEqual([]);
        now = T0 + 72 * 60 * 60 * 1000;
        expect(await listPendingGroupings(deps(), who(61))).toEqual([
          { corporationId: CORP, minerId: 'm-a', mainCharacterId: 60 },
        ]);
        expect(await listPendingGroupings(deps(), who(60))).toEqual([]);
        await confirmGrouping(deps(), who(61), CORP, 'm-a');
        expect(await listPendingGroupings(deps(), who(61))).toEqual([]);
      });
    });

    it("closes a paid Statement's days for good, and a rebill never reaches them", async () => {
      await turnOn();
      const issued = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s1'),
      });
      expect(issued.verifyToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1', { amount: 1 }) })
        )
      ).toBe('statement-exists');
      await edit(
        ACCOUNTANT,
        { action: 'rebill', minerId: 'solo:50', fromDate: '2026-10-05', reason: 'prices' },
        true
      );
      await edit(ACCOUNTANT, { action: 'settleStatements', statementIds: ['s1'] });
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            { action: 'rebill', minerId: 'solo:50', fromDate: '2026-10-05', reason: 'again' },
            true
          )
        )
      ).toBe('paid-days-closed');
      await edit(
        ACCOUNTANT,
        { action: 'rebill', minerId: 'solo:50', fromDate: '2026-11-01', reason: 'later' },
        true
      );
      // Settling again, or settling another, only ever grows the set.
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s2') });
      await edit(ACCOUNTANT, { action: 'settleStatements', statementIds: ['s1', 's2'] });
      expect((await book().collection('meta').doc('paid').get()).get('ids').sort()).toEqual([
        's1',
        's2',
      ]);
    });

    it('needs a Director to rebill a corp member', async () => {
      await turnOn();
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput({ corporationId: CORP, observed: [row(10, '2026-10-18T10:00:00Z')] }, now)
      );
      const rebill = { action: 'rebill', minerId: 'solo:50', fromDate: '2026-10-10', reason: 'x' };
      expect(await reason(edit(ACCOUNTANT, rebill, true))).toBe('director-approval');
      await edit(DIRECTOR, rebill, true);
    });

    it('confirms or rejects a declaration once', async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      const { declarationId } = await edit(ACCOUNTANT, {
        action: 'declare',
        statementId: 's1',
        kind: 'contract',
      });
      await edit(ACCOUNTANT, {
        action: 'resolveDeclaration',
        declarationId,
        resolution: 'rejected',
        reason: 'no contract',
      });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'resolveDeclaration', declarationId, resolution: 'confirmed' })
        )
      ).toBe('already-resolved');
    });
  });

  describe('audit log', () => {
    it('appends one entry per write, never holds a token, and attributes the actor', async () => {
      await turnOn();
      now += 1000;
      await edit(ACCOUNTANT, {
        action: 'addAdjustment',
        minerId: 'solo:50',
        date: '2026-10-05',
        amount: -100,
        reason: 'rounding',
      });
      const entries = (await book().collection('audit').orderBy('at').get()).docs.map((d) =>
        d.data()
      );
      expect(entries.map((e) => e.action)).toEqual(['turnOn', 'addAdjustment']);
      expect(entries[1]).toMatchObject({ by: ACCOUNTANT, byName: `Pilot ${ACCOUNTANT}` });
      expect(JSON.stringify(entries)).not.toContain('tok-');
    });

    it("stamps an Adjustment and a write-off with the Miner's sign-ins (#4622)", async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'addAdjustment',
        minerId: 'solo:50',
        date: '2026-10-05',
        amount: -100,
        reason: 'rounding',
      });
      await edit(
        ACCOUNTANT,
        { action: 'writeOff', minerId: 'solo:50', amount: 5, reason: 'left' },
        true
      );
      for (const kind of ['adjustments', 'writeOffs']) {
        const docs = (await book().collection(kind).get()).docs.map((d) => d.data());
        expect(docs.map((d) => d.uids)).toEqual([['char:50']]);
      }
    });
  });

  describe('CEO reclaim', () => {
    it('lets only the CEO reclaim, and makes the other officers re-verify', async () => {
      await turnOn();
      expect(await reason(reclaimBook(deps(), who(DIRECTOR), withToken(DIRECTOR)))).toBe(
        'role-required'
      );
      identities.set(DIRECTOR, as([], true));
      const result = await reclaimBook(deps(), who(DIRECTOR), withToken(DIRECTOR));
      expect(result.officersRevoked).toBe(2);
      expect((await book().get()).get('ownerCharacterId')).toBe(DIRECTOR);
      expect((await book().collection('officers').get()).docs.map((d) => d.id)).toEqual([
        `char:${DIRECTOR}`,
      ]);
      expect(
        await reason(edit(ACCOUNTANT, { action: 'updateSettings', patch: { graceHours: 1 } }))
      ).toBe('not-an-officer');
    });
  });

  describe('delete the book', () => {
    it('turns a new book on with a setup window before members see it', async () => {
      await turnOn();
      expect((await book().get()).get('membersSeeFrom')).toBe(T0 + 72 * 60 * 60 * 1000);
    });

    it('lets only whoever turned it on, or the CEO, delete it, and a re-open starts clean', async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      identities.set(ACCOUNTANT, as(['Director']));
      expect(await reason(deleteBook(deps(), who(ACCOUNTANT), withToken(ACCOUNTANT)))).toBe(
        'not-opener'
      );
      expect((await book().get()).exists).toBe(true);

      const dropped: number[] = [];
      await deleteBook(deps(), who(DIRECTOR), withToken(DIRECTOR), async (corp) => {
        dropped.push(corp);
      });
      expect(dropped).toEqual([CORP]);
      expect((await book().get()).exists).toBe(false);
      expect((await book().collection('statements').get()).empty).toBe(true);
      expect(
        (await db.collection('corpTaxBookTokens').where('corporationId', '==', CORP).get()).empty
      ).toBe(true);
      expect(await reason(deleteBook(deps(), who(DIRECTOR), withToken(DIRECTOR)))).toBe('no-book');

      await turnOn();
      expect((await book().collection('statements').get()).empty).toBe(true);
    });
  });

  describe('verify link', () => {
    it('reads the Statement by token, and stops reminders with one audited manual reminder allowed', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s1'),
      });
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'm1',
        minerId: 'solo:50',
        characterId: 50,
        amount: 3,
        at: '2026-11-02T00:00:00Z',
      });
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'm2',
        minerId: 'solo:99',
        characterId: 99,
        amount: 3,
        at: '2026-11-02T00:00:00Z',
      });
      const view = await readStatementByToken(deps(), String(verifyToken));
      expect(view.statement).toMatchObject({ id: 's1', amount: 10_000_000 });
      expect(view.statement).not.toHaveProperty('verifyToken');
      for (const key of ['characterIds', 'minerId', 'issuedBy', 'uids', 'manualRemindersSent']) {
        expect(view.statement).not.toHaveProperty(key);
      }
      expect(JSON.stringify(view.statement.lines)).not.toContain('characterId');
      expect((await book().collection('statements').doc('s1').get()).data()).not.toHaveProperty(
        'verifyToken'
      );
      expect((await book().collection('statementLinks').doc('s1').get()).get('verifyToken')).toBe(
        verifyToken
      );
      expect(view.terms).toMatchObject({ hubId: 'jita', oreForm: 'compressed' });
      expect(view.payments.map((p) => p.id)).toEqual(['m1']);
      expect(view.settlement).toMatchObject({ amount: 10_000_000, credited: 3 });
      expect(view.accountClosed).toBe(false);
      expect(view.remindersStopped).toBe(false);

      await setRemindersByToken(deps(), String(verifyToken), true);
      expect((await readStatementByToken(deps(), String(verifyToken))).remindersStopped).toBe(true);
      await edit(ACCOUNTANT, { action: 'recordReminder', statementId: 's1' });
      expect(await reason(edit(ACCOUNTANT, { action: 'recordReminder', statementId: 's1' }))).toBe(
        'reminders-stopped'
      );
      const log = (await book().collection('audit').orderBy('at').get()).docs.map((d) => d.data());
      await edit(ACCOUNTANT, {
        action: 'recordMail',
        statementId: 's1',
        mailId: 99,
        kind: 'statement',
      });
      const mailLog = (await book().collection('audit').orderBy('at').get()).docs
        .map((d) => d.data())
        .find((e) => e.action === 'recordMail');
      expect(mailLog).toMatchObject({
        detail: { statementId: 's1', mailId: 99, kind: 'statement' },
      });
      const stop = log.find((e) => e.action === 'stopReminders');
      expect(stop).toMatchObject({
        by: null,
        via: 'verify-link',
        detail: { statementId: 's1', stopped: true },
      });
      expect(JSON.stringify(log)).not.toContain(String(verifyToken));
    });

    it('shows only the payments credited to this Statement, oldest first across Statements', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s1', { issuedAt: '2026-10-01T00:00:00.000Z', amount: 10_000_000 }),
      });
      const second = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s2', {
          issuedAt: '2026-11-01T00:00:00.000Z',
          amount: 8_000_000,
          code: 'DEF456',
        }),
      });
      // 12M: all of s1 (10M) and 2M of s2. A later 1M goes to s2 as well.
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'big',
        minerId: 'solo:50',
        characterId: 50,
        amount: 12_000_000,
        at: '2026-11-02T00:00:00Z',
      });
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'small',
        minerId: 'solo:50',
        characterId: 50,
        amount: 1_000_000,
        at: '2026-11-03T00:00:00Z',
      });
      const view = await readStatementByToken(deps(), String(second.verifyToken));
      expect(view.payments.map((p) => [p.id, p.amount])).toEqual([
        ['big', 2_000_000],
        ['small', 1_000_000],
      ]);
      expect(view.settlement).toMatchObject({ credited: 3_000_000, remaining: 5_000_000 });
    });

    it('flags a Miner whose account is closed', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s1'),
      });
      await book().collection('miners').doc('solo:50').set({ closedAt: '2026-11-05T00:00:00Z' });
      expect((await readStatementByToken(deps(), String(verifyToken))).accountClosed).toBe(true);
    });

    describe('moon and Extraction dismissals (#4184)', () => {
      const started = '2026-10-10T00:00:00Z';
      const extractionId = `1000_${Date.parse(started)}`;
      // Fractured 17 Oct 03:00, expired 19 Oct 03:00: it covers 17-19 Oct.
      const seedExtraction = () =>
        book().collection('extractions').doc(extractionId).set({
          id: extractionId,
          structureId: 1000,
          moonId: 7,
          extractionStartTime: started,
          chunkArrivalTime: '2026-10-17T00:00:00Z',
          naturalDecayTime: '2026-10-17T03:00:00Z',
        });
      const billed = (id: string, date: string, structureId: number) =>
        statement(id, {
          amount: 4_000_000,
          lines: [
            {
              kind: 'mined',
              date,
              characterId: 50,
              chargeKey: `50:${structureId}:${date}`,
              structureId,
              oreLines: [],
              estimatedValue: 1,
              tax: 4_000_000,
            },
          ],
        });
      const settlementAfter = async (
        dismissal: Record<string, unknown>,
        line: [string, number]
      ) => {
        await turnOn();
        await seedExtraction();
        const { verifyToken } = await edit(ACCOUNTANT, {
          action: 'issueStatement',
          statement: billed('s1', ...line),
        });
        await edit(ACCOUNTANT, { action: 'dismiss', reason: 'waived', ...dismissal }, true);
        return (await readStatementByToken(deps(), String(verifyToken))).settlement;
      };

      it('settles a Statement whose day a moon dismissal waived', async () => {
        expect(
          await settlementAfter({ scope: 'moon', targetId: '7' }, ['2026-10-18', 1000])
        ).toMatchObject({ credited: 4_000_000, remaining: 0, settled: true });
      });

      it('settles a Statement whose day an Extraction dismissal waived', async () => {
        expect(
          await settlementAfter({ scope: 'extraction', targetId: extractionId }, [
            '2026-10-18',
            1000,
          ])
        ).toMatchObject({ credited: 4_000_000, remaining: 0, settled: true });
      });

      it('leaves a day outside the Extraction owed', async () => {
        expect(
          await settlementAfter({ scope: 'moon', targetId: '7' }, ['2026-10-20', 1000])
        ).toMatchObject({ credited: 0, remaining: 4_000_000, settled: false });
      });
    });

    it('does not resolve a made-up token', async () => {
      expect(await reason(readStatementByToken(deps(), 'x'.repeat(43)))).toBe('invalid-token');
    });
  });
  describe('closeAccount (#4184)', () => {
    const close = (extra: Record<string, unknown> = {}, token = false) =>
      edit(
        ACCOUNTANT,
        {
          action: 'closeAccount',
          minerId: 'solo:50',
          reason: 'Guest left the area',
          credit: { kind: 'refund' },
          ...extra,
        },
        token
      );
    const miner = async () => (await book().collection('miners').doc('solo:50').get()).data();

    it('issues the final Statement, closes the Miner and audits it', async () => {
      await turnOn();
      const out = await close({ statement: statement('final_solo:50') });
      expect(out).toMatchObject({ statementId: 'final_solo:50', owed: 10_000_000, credit: 0 });
      expect(await miner()).toMatchObject({
        closedAt: new Date(T0).toISOString(),
        closedBy: ACCOUNTANT,
        finalStatementId: 'final_solo:50',
        closeCredit: { amount: 0, disposition: 'refund' },
        uids: ['char:50'],
      });
      const view = await readStatementByToken(deps(), String(out.verifyToken));
      expect(view.accountClosed).toBe(true);
      const log = (await book().collection('audit').get()).docs.map((d) => d.data());
      expect(log.find((e) => e.action === 'closeAccount')).toMatchObject({
        detail: { minerId: 'solo:50', statementId: 'final_solo:50', disposition: 'refund' },
      });
    });

    it('records the credit left to refund by default', async () => {
      await turnOn();
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'p1',
        minerId: 'solo:50',
        characterId: 50,
        amount: 12_000_000,
        at: '2026-10-30T00:00:00Z',
      });
      await close({ statement: statement('final_solo:50') });
      expect(await miner()).toMatchObject({
        closeCredit: { amount: 2_000_000, disposition: 'refund' },
      });
    });

    it('stops there: no later Statement, no second close, no regrouping', async () => {
      await turnOn();
      await close({ statement: statement('final_solo:50') });
      expect(
        await reason(edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s2') }))
      ).toBe('account-closed');
      expect(await reason(close())).toBe('already-closed');
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'setMiner',
            minerId: 'solo:50',
            characterIds: [50],
            mainCharacterId: 50,
          })
        )
      ).toBe('account-closed');
    });

    it('closes with no final Statement when nothing is left to bill', async () => {
      await turnOn();
      await close();
      expect(await miner()).not.toHaveProperty('finalStatementId');
    });

    it('refuses a member', async () => {
      await turnOn();
      await syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput({ corporationId: CORP, observed: [row(100, '2026-10-18T10:00:00Z')] }, now)
      );
      expect(await reason(close())).toBe('not-a-guest');
    });

    it('forfeits credit only with consent or after 90 days, and re-checks the role live', async () => {
      await turnOn();
      const forfeit = (basis: Record<string, unknown>) => ({ credit: { kind: 'forfeit', basis } });
      const consent = forfeit({ kind: 'consent', note: 'Agreed in a corp mail on 15 Oct' });
      expect(await reason(close(consent))).toBe('live-check-required');
      expect(await reason(close(forfeit({ kind: 'no-reply', askedAt: '2026-08-01' }), true))).toBe(
        'forfeit-not-allowed'
      );
      // 90 days before 18 Oct is 20 Jul.
      await close(forfeit({ kind: 'no-reply', askedAt: '2026-07-20' }), true);
      expect(await miner()).toMatchObject({
        closeCredit: { disposition: 'forfeit', basis: { kind: 'no-reply', askedAt: '2026-07-20' } },
      });
    });

    it('records a forfeit with consent', async () => {
      await turnOn();
      await close(
        {
          credit: {
            kind: 'forfeit',
            basis: { kind: 'consent', note: 'Agreed in a corp mail on 15 Oct' },
          },
        },
        true
      );
      expect(await miner()).toMatchObject({ closeCredit: { disposition: 'forfeit' } });
    });
  });
});

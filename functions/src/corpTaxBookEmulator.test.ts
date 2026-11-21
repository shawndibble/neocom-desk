// Corp Tax Book callables against the Firestore emulator (issue #4061). Runs
// only under `npm run test:rules` at the repo root (which starts the emulator
// and sets FIRESTORE_EMULATOR_HOST); a plain `npm test` skips it.
import { applyRekeyBackfill, planRekeyBackfill } from './corpTaxBookRekeyBackfill.js';
import type { Caller } from './actorAuth.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearEmulator, emulatorDb as db, emulatorSuite } from './testSupport/emulator.js';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  parseBookCall,
  parseDeclareOwnInput,
  parseDisputeConflictInput,
  parseWithdrawDisputeInput,
  parseEditAction,
  parseSyncInput,
  parseTurnOnInput,
} from './corpTaxBook.js';
import { ROLES_SCOPE, type CorpIdentity } from './corpTaxBookEsi.js';
import {
  KEPT_ON_BOOK_DELETE,
  claimPayment,
  declareOwnPayment,
  disputeConflict,
  withdrawDispute,
  deleteBook,
  confirmGrouping,
  declineGrouping,
  declineGroupingByToken,
  declineLink,
  promoteProvenClaims,
  editBook,
  listPendingGroupings,
  readStatementByToken,
  reclaimBook,
  setRemindersByToken,
  syncBook,
  turnOnBook,
  verifyOfficer,
  type BookDeps,
} from './corpTaxBookStore.js';
import { SRP_CLAIMS, SRP_COLLECTIONS } from './srpTypes.js';
import { VETTING_COLLECTIONS } from './vettingTypes.js';

const CORP = 98000001;
const T0 = Date.parse('2026-10-18T12:00:00Z');

let now = T0;
const identities = new Map<number, CorpIdentity>();
let identityCalls = 0;
const droppedScope = new Set<number>();

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
      scopes: droppedScope.has(id) ? [] : [ROLES_SCOPE],
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

const book = () => db.collection('corps').doc(String(CORP));
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

emulatorSuite('Corp Tax Book callables (emulator)', () => {
  afterAll(clearEmulator);
  beforeEach(async () => {
    await clearEmulator();
    now = T0;
    identityCalls = 0;
    identities.clear();
    droppedScope.clear();
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

  // A character that mined here is a corporation member the book has seen, so a grouping reads
  // it at once; one that never mined here is an Officer claim (Player slice).
  async function minedHere(...characterIds: number[]) {
    await syncBook(
      deps(),
      who(ACCOUNTANT),
      parseSyncInput(
        {
          corporationId: CORP,
          observed: characterIds.map((characterId) =>
            row(5, '2026-10-18T09:00:00Z', { characterId, date: '2026-10-16' })
          ),
        },
        now
      )
    );
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

    it('revokes the held access when the roles scope is dropped', async () => {
      await turnOn();
      now = T0 + 11 * 60_000;
      droppedScope.add(JUNIOR);
      expect(
        await reason(verifyOfficer(deps(), who(JUNIOR), parseBookCall(withToken(JUNIOR))))
      ).toBe('missing-scope');
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
        graceHours: 0.5,
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
      // Stamped on every write, so a client can read a delta by it.
      const stampedAt = (await read())?.updatedAt;
      expect(stampedAt?.toMillis()).toEqual(expect.any(Number));
      await sync(ACCOUNTANT, { observed: [row(500, '2026-10-18T09:00:00Z')] });
      expect((await read())?.quantity).toBe(100);
      const result = await sync(ACCOUNTANT, { observed: [row(300, '2026-10-18T11:30:00Z')] });
      expect(result.observedChanged).toBe(1);
      expect((await read())?.quantity).toBe(300);
      expect((await read())?.updatedAt.toMillis()).toBeGreaterThanOrEqual(stampedAt.toMillis());
      expect((await book().get()).get('lastSync')).toMatchObject({ byCharacterId: ACCOUNTANT });
    });

    it("records when a sync last read the wallet's donations, and never one that could not", async () => {
      await turnOn();
      const readAt = async () => (await book().get()).get('donationsReadAt');
      // An older client says nothing: the book keeps no record either way.
      await sync(ACCOUNTANT, {});
      expect(await readAt()).toBeUndefined();
      // A sync that could not read the wallet: no read yet.
      await sync(ACCOUNTANT, { donationsRead: false });
      expect(await readAt()).toBeNull();
      await sync(ACCOUNTANT, { donationsRead: true });
      const at = await readAt();
      expect(at).toEqual(expect.any(Number));
      // Neither a later unread sync nor an overflow call without the flag moves it back.
      await sync(ACCOUNTANT, { donationsRead: false });
      await sync(ACCOUNTANT, {});
      expect(await readAt()).toBe(at);
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

    it('stamps rows with their Extraction, backfills old rows, and re-stamps on a correction', async () => {
      await turnOn();
      const id = '50_45490_2026-10-17_1000';
      const read = async () => (await book().collection('observed').doc(id).get()).data();
      const pull = {
        structureId: 1000,
        moonId: 7,
        extractionStartTime: '2026-10-10T00:00:00Z',
        chunkArrivalTime: '2026-10-17T00:00:00Z',
        naturalDecayTime: '2026-10-17T03:00:00Z',
      };
      const pullId = `1000_${Date.parse(pull.extractionStartTime)}`;
      identities.set(ACCOUNTANT, as(['Accountant', 'Station_Manager']));
      now = T0 + 25 * 60_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));

      // A row that arrives before any Extraction is not stamped, and is when the Extraction lands.
      await sync(ACCOUNTANT, { observed: [row(100, '2026-10-18T10:00:00Z')] });
      expect((await read())?.extractionId).toBeUndefined();
      await sync(ACCOUNTANT, { extractions: [pull] });
      expect((await read())?.extractionId).toBe(pullId);
      const stampedAt = (await read())?.updatedAt;

      // A later quantity keeps the stamp, and a stamp never moves `updatedAt`.
      await sync(ACCOUNTANT, { observed: [row(300, '2026-10-18T11:30:00Z')] });
      expect((await read())?.extractionId).toBe(pullId);
      expect((await read())?.quantity).toBe(300);
      expect(stampedAt.toMillis()).toEqual(expect.any(Number));

      // A correction (the pull was cancelled) clears the stamp of the rows it no longer covers.
      await sync(ACCOUNTANT, { extractions: [{ ...pull, cancelledAt: '2026-10-17T01:00:00Z' }] });
      expect((await read())?.extractionId).toBeUndefined();
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
        notTaxReason: 'buyback',
      });
      await edit(
        DIRECTOR,
        { action: 'markNotTax', paymentId: 'j1_99', notTaxAmount: 300_000 },
        true
      );
      const reasonless = (await book().collection('payments').doc('j1_99').get()).data();
      expect(reasonless).toMatchObject({ notTaxAmount: 300_000 });
      expect(reasonless).not.toHaveProperty('notTaxReason');
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

    it("adds a counted division to the stored list, keeping another officer's addition", async () => {
      await turnOn();
      // Both officers answered "Count division" from the same stale list, [1]. Each also sends
      // the full list an older server would store; this server ignores it for `addDivision`.
      await edit(DIRECTOR, {
        action: 'updateSettings',
        patch: { addDivision: 3, divisions: [1, 3] },
      });
      await edit(ACCOUNTANT, {
        action: 'updateSettings',
        patch: { addDivision: 5, divisions: [1, 5] },
      });
      expect((await book().get()).get('divisions')).toEqual([1, 3, 5]);
      await edit(ACCOUNTANT, { action: 'updateSettings', patch: { addDivision: 3 } });
      expect((await book().get()).get('divisions')).toEqual([1, 3, 5]);
    });

    it("merges a counted division's name into the stored names, and audits the stored list", async () => {
      await turnOn();
      await edit(DIRECTOR, {
        action: 'updateSettings',
        patch: { addDivision: 3, divisions: [1, 3], divisionNames: { '1': 'Main', '3': 'Tax' } },
      });
      await edit(ACCOUNTANT, {
        action: 'updateSettings',
        patch: { addDivision: 5, divisions: [1, 5], divisionNames: { '1': 'Main', '5': 'Ore' } },
      });
      expect((await book().get()).get('divisionNames')).toEqual({
        '1': 'Main',
        '3': 'Tax',
        '5': 'Ore',
      });
      const audit = await book().collection('audit').get();
      const details = audit.docs.map(
        (d) => d.get('detail') as { patch?: { divisions?: number[] } }
      );
      expect(details.some((d) => d.patch?.divisions?.join() === '1,3,5')).toBe(true);
      // The stale list the client sent for an older server was never stored, so never audited.
      expect(details.some((d) => d.patch?.divisions?.join() === '1,5')).toBe(false);
    });

    it('reads a book with no stored divisions as division 1, as the sync does', async () => {
      await turnOn();
      await book().update({ divisions: FieldValue.delete() });
      await edit(ACCOUNTANT, {
        action: 'updateSettings',
        patch: { divisions: [1, 2], divisionsBase: [1] },
      });
      expect((await book().get()).get('divisions')).toEqual([1, 2]);
      await book().update({ divisions: FieldValue.delete() });
      await edit(ACCOUNTANT, { action: 'updateSettings', patch: { addDivision: 3 } });
      expect((await book().get()).get('divisions')).toEqual([1, 3]);
    });

    it('refuses a divisions list whose base no longer matches the stored one', async () => {
      await turnOn();
      // A dialog opened on [1]; meanwhile another officer counted division 4.
      await edit(DIRECTOR, { action: 'updateSettings', patch: { addDivision: 4 } });
      const before = await auditCount();
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'updateSettings',
            patch: { divisions: [1, 2], divisionsBase: [1], minimumStatement: 1 },
          })
        )
      ).toBe('divisions-changed');
      expect((await book().get()).data()).toMatchObject({
        divisions: [1, 4],
        minimumStatement: 5_000_000,
      });
      expect(await auditCount()).toBe(before);
      await edit(ACCOUNTANT, {
        action: 'updateSettings',
        patch: { divisions: [2, 4], divisionsBase: [4, 1] },
      });
      expect((await book().get()).get('divisions')).toEqual([2, 4]);
      // An older client sends no base: its list is stored as-is.
      await edit(ACCOUNTANT, { action: 'updateSettings', patch: { divisions: [1] } });
      expect((await book().get()).get('divisions')).toEqual([1]);
    });

    it('moves the start date and ends the member setup window, Director only', async () => {
      await turnOn();
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'updateSettings', patch: { startDate: '2026-09-20' } })
        )
      ).toBe('director-only');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { startDate: '2026-09-20' } });
      const data = (await book().get()).data()!;
      expect(data.startDate).toBe('2026-09-20');
      expect(data.rates[0].effectiveFrom).toBe('2026-09-20');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { showToMembers: true } });
      expect((await book().get()).get('membersSeeFrom')).toBe(now);
    });

    it('switches to a running account once (Director), then issues only late notices', async () => {
      await turnOn();
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'updateSettings', patch: { switchToRunningAccount: true } })
        )
      ).toBe('director-only');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { switchToRunningAccount: true } });
      const from = (await book().get()).get('runningAccountFrom');
      expect(from).toBe(new Date(now).toISOString());
      now += 60_000;
      await edit(DIRECTOR, { action: 'updateSettings', patch: { switchToRunningAccount: true } });
      expect((await book().get()).get('runningAccountFrom')).toBe(from);
      expect(
        await reason(edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') }))
      ).toBe('running-account');
      await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: { ...statement('s1'), kind: 'notice' },
      });
      expect((await book().collection('statements').doc('s1').get()).get('kind')).toBe('notice');
    });

    it('lets a rate start up to 30 days back, and only on a day not yet on a Statement for a record rate', async () => {
      await turnOn();
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'addRate',
            rate: { scope: 'corp', pct: 20, effectiveFrom: '2026-09-17' },
          })
        )
      ).toBe('rate-too-old');
      await edit(ACCOUNTANT, {
        action: 'addRate',
        rate: { scope: 'corp', pct: 20, effectiveFrom: '2026-09-18' },
      });
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
      // A backdated rate may not start on a day the issued Statement bills.
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'addRate',
            rate: { scope: 'corp', pct: 0, effectiveFrom: '2026-10-17' },
          })
        )
      ).toBe('day-on-statement');
      expect((await book().get()).get('rates')).toHaveLength(4);
    });

    it('keeps a per-refinery rate for each refinery on one day (#4621)', async () => {
      await turnOn();
      for (const structureId of [1035000000001, 1035000000002]) {
        await edit(ACCOUNTANT, {
          action: 'addRate',
          rate: { scope: 'structure', structureId, pct: 4, effectiveFrom: '2026-10-18' },
        });
      }
      expect(
        ((await book().get()).get('rates') as { scope: string; structureId?: number }[])
          .filter((r) => r.scope === 'structure')
          .map((r) => r.structureId)
      ).toEqual([1035000000001, 1035000000002]);
    });

    it('writes a batch of rates all or nothing, one audit entry per rate (#6323)', async () => {
      await turnOn();
      const before = await auditCount();
      const rates = [
        { scope: 'guest', pct: 25, effectiveFrom: '2026-10-18' },
        { scope: 'corp', pct: 10, effectiveFrom: '2026-10-19' },
      ];
      await edit(ACCOUNTANT, { action: 'addRates', rates });
      expect(await auditCount()).toBe(before + 2);
      const stored = (await book().get()).get('rates') as unknown[];
      expect(stored).toEqual(expect.arrayContaining(rates));
      // One rate dated too far back refuses the whole batch: nothing written, nothing audited.
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'addRates',
            rates: [
              { scope: 'guest', pct: 30, effectiveFrom: '2026-10-20' },
              { scope: 'corp', pct: 20, effectiveFrom: '2026-09-17' },
            ],
          })
        )
      ).toBe('rate-too-old');
      expect((await book().get()).get('rates')).toHaveLength(stored.length);
      expect(await auditCount()).toBe(before + 2);
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

    it("lets an officer set and clear who answers members' tax questions", async () => {
      await turnOn();
      const taxContact = { kind: 'characters', ids: [11, 12] };
      await edit(ACCOUNTANT, { action: 'updateSettings', patch: { taxContact } });
      expect((await book().get()).get('taxContact')).toEqual(taxContact);
      await edit(ACCOUNTANT, { action: 'updateSettings', patch: { taxContact: null } });
      expect((await book().get()).data()).not.toHaveProperty('taxContact');
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

    it('regroup moves the absorbed Miners records onto the surviving id (#6450)', async () => {
      await turnOn();
      await minedHere(60, 62, 63);
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-b',
        characterIds: [62, 63],
        mainCharacterId: 62,
      });
      const b = book();
      await b
        .collection('statements')
        .doc('s-b')
        .set(statement('s-b', { minerId: 'm-b', uids: ['char:62', 'char:63'] }));
      await b
        .collection('statements')
        .doc('s-63')
        .set(statement('s-63', { minerId: 'solo:63', uids: ['char:63'] }));
      await b.collection('payments').doc('p-b').set({ id: 'p-b', minerId: 'm-b', amount: 5 });
      await b
        .collection('payments')
        .doc('p-other')
        .set({ id: 'p-other', minerId: 'solo:70', amount: 5 });
      await b
        .collection('disputes')
        .doc('m-b_2026-10-05')
        .set({ minerId: 'm-b', date: '2026-10-05', uids: ['char:62'] });
      await b.collection('accounts').doc('m-b').set({ minerId: 'm-b' });
      await b.collection('minerTotals').doc('solo:63').set({ minerId: 'solo:63' });
      await edit(ACCOUNTANT, {
        action: 'regroupMiner',
        minerId: 'solo:60',
        characterIds: [60, 62, 63],
        mainCharacterId: 60,
        absorbMinerIds: ['m-b'],
      });
      const readers = ['char:60', 'char:62', 'char:63'];
      for (const id of ['s-b', 's-63'])
        expect((await b.collection('statements').doc(id).get()).data()).toMatchObject({
          minerId: 'solo:60',
          uids: readers,
        });
      expect((await b.collection('payments').doc('p-b').get()).get('minerId')).toBe('solo:60');
      expect((await b.collection('payments').doc('p-other').get()).get('minerId')).toBe('solo:70');
      expect((await b.collection('disputes').doc('m-b_2026-10-05').get()).exists).toBe(false);
      expect((await b.collection('disputes').doc('solo_60_2026-10-05').get()).data()).toMatchObject(
        { minerId: 'solo:60', uids: readers }
      );
      expect((await b.collection('accounts').doc('m-b').get()).exists).toBe(false);
      expect((await b.collection('minerTotals').doc('solo:63').get()).exists).toBe(false);
    });

    it('the backfill moves an older grouping alt records onto its group, and a re-run finds none (#6450)', async () => {
      await turnOn();
      await minedHere(62, 63);
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-b',
        characterIds: [62, 63],
        mainCharacterId: 62,
        // grouped before the fix: records already sit under the alt's own id
      });
      const b = book();
      await b
        .collection('statements')
        .doc('s-63')
        .set(statement('s-63', { minerId: 'solo:63', uids: ['char:63'] }));
      const plan = await planRekeyBackfill(db, CORP);
      expect(plan.writes).toHaveLength(1);
      await applyRekeyBackfill(db, plan);
      expect((await b.collection('statements').doc('s-63').get()).data()).toMatchObject({
        minerId: 'm-b',
        uids: ['char:62', 'char:63'],
      });
      expect((await planRekeyBackfill(db, CORP)).writes).toEqual([]);
    });

    it('adds an outsider by a regroup as an officer claim that cannot read yet', async () => {
      await turnOn();
      await minedHere(60);
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
      expect(out.pendingConfirmation).toEqual([]);
      expect(out.officerClaimed).toEqual([61]);
      const stored = await book().collection('miners').doc('m-a').get();
      expect(stored.get('uids')).toEqual(['char:60']);
      expect(stored.get('officerClaimed')).toEqual([61]);
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

    it('lets a player count their own donation held for review only when they say so, from the book start', async () => {
      await turnOn();
      const held = (id: string, at: string) =>
        book().collection('payments').doc(id).set({
          id,
          source: 'donation',
          characterId: 77,
          uid: 'char:77',
          amount: 10,
          at,
          division: 5,
          reviewReason: 'no-open-balance',
        });
      await held('j5_7', '2026-10-18T00:00:00Z');
      await held('j5_6', '2026-09-20T00:00:00Z');
      // The automatic claim never takes one: an officer reviews it unless the player says it was tax.
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j5_7'))).toBe('in-review');
      expect(await reason(claimPayment(deps(), who(78), CORP, 'j5_7', { inReview: true }))).toBe(
        'not-found'
      );
      // Paid before the book bills from: no mining it bills could have been owed then.
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j5_6', { inReview: true }))).toBe(
        'before-start'
      );
      expect(await claimPayment(deps(), who(77), CORP, 'j5_7', { inReview: true })).toEqual({
        minerId: 'solo:77',
      });
      const p = (await book().collection('payments').doc('j5_7').get()).data();
      expect(p).toMatchObject({ minerId: 'solo:77', claimedBy: 77 });
      expect(p?.reviewReason).toBeUndefined();
    });

    it('credits a claim to the Miner the character is grouped into', async () => {
      await turnOn();
      await minedHere(60, 77);
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

    it('credits a claim from a never-mined character to its own Miner until its link is proven', async () => {
      await turnOn();
      await minedHere(60);
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
              { refId: 9, division: 1, characterId: 77, amount: 10, at: '2026-10-18T00:00:00Z' },
            ],
          },
          now
        )
      );
      // An officer claim is no reader of the group, so it is its own Miner for now.
      expect(await claimPayment(deps(), who(77), CORP, 'j1_8')).toEqual({ minerId: 'solo:77' });
      await db.collection('playerCharacters').doc('77').set({
        characterId: 77,
        playerId: '60',
        ownerHash: 'h',
        provenAt: '2026-10-19T00:00:00Z',
      });
      expect(await promoteProvenClaims(deps(), CORP)).toEqual({ promoted: 1 });
      expect(await claimPayment(deps(), who(77), CORP, 'j1_9')).toEqual({ minerId: 'm-a' });
    });

    it('refuses a claim when the corporation has no book', async () => {
      expect(await reason(claimPayment(deps(), who(77), CORP, 'j1_7'))).toBe('no-book');
    });

    it('groups characters, keeps an outsider an officer claim, and unlinks', async () => {
      await turnOn();
      await minedHere(60);
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
      expect(out.pendingConfirmation).toEqual([]);
      expect(out.officerClaimed).toEqual([61]);
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
      // The claim is not a reader until its owner signs in as it; nothing waits on a confirm.
      expect(await reason(confirmGrouping(deps(), who(61), CORP, 'm-a'))).toBe('nothing-pending');
      await edit(ACCOUNTANT, { action: 'unlink', minerId: 'm-a', characterId: 61 });
      expect((await book().collection('miners').doc('m-a').get()).exists).toBe(false);
    });

    describe('officer claims (Player slice)', () => {
      const outsider = async () => {
        await turnOn();
        await minedHere(60);
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
      };
      const group = () =>
        edit(ACCOUNTANT, {
          action: 'setMiner',
          minerId: 'm-a',
          characterIds: [60, 61],
          mainCharacterId: 60,
        });

      it('refuses an outsider as the main of a group that has a corp member', async () => {
        await outsider();
        expect(
          await reason(
            edit(ACCOUNTANT, {
              action: 'setMiner',
              minerId: 'm-a',
              characterIds: [60, 61],
              mainCharacterId: 61,
            })
          )
        ).toBe('outsider-main');
      });

      it('lets the added character decline its link, and records the removal', async () => {
        await outsider();
        await group();
        expect(await declineLink(deps(), who(61), CORP, 'm-a')).toEqual({ declined: true });
        expect((await book().collection('miners').doc('m-a').get()).exists).toBe(false);
        const declined = await book().collection('meta').doc('declinedAutoGroup').get();
        expect(declined.get('ids')).toEqual([61]);
      });

      it('promotes a claim once its owner has a Self-proven link', async () => {
        await outsider();
        await group();
        await db.collection('playerCharacters').doc('61').set({
          characterId: 61,
          playerId: '60',
          ownerHash: 'h',
          provenAt: '2026-10-19T00:00:00Z',
        });
        expect(await promoteProvenClaims(deps(), CORP)).toEqual({ promoted: 1 });
        const stored = await book().collection('miners').doc('m-a').get();
        expect(stored.get('officerClaimed')).toEqual([]);
        expect(stored.get('provenCharacterIds')).toEqual([61]);
        expect([...stored.get('uids')].sort()).toEqual(['char:60', 'char:61']);
      });
    });

    describe('a guest answering a hand-made grouping (#4210)', () => {
      const pendingGuest = async (opts: { mainMined?: boolean } = {}) => {
        await turnOn();
        if (opts.mainMined !== false) await minedHere(60);
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
        // A group made before the Player slice still waits on the guest: keep that path covered.
        await book()
          .collection('miners')
          .doc('m-a')
          .update({ pendingConfirmation: [61], officerClaimed: [] });
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

      it("keeps a pending guest's own records until they confirm, then moves them (#6450)", async () => {
        await pendingGuest();
        const b = book();
        await b
          .collection('payments')
          .doc('p-guest')
          .set({ id: 'p-guest', minerId: 'solo:61', amount: 5 });
        await b
          .collection('rebills')
          .doc('r-guest')
          .set({ id: 'r-guest', minerId: 'solo:61', fromDate: '2026-10-01' });
        expect((await b.collection('payments').doc('p-guest').get()).get('minerId')).toBe(
          'solo:61'
        );
        await confirmGrouping(deps(), who(61), CORP, 'm-a');
        expect((await b.collection('payments').doc('p-guest').get()).get('minerId')).toBe('m-a');
        expect((await b.collection('rebills').doc('r-guest').get()).get('minerId')).toBe('m-a');
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
        await // A closed account is a guest's: nobody in it mined here.
        await pendingGuest({ mainMined: false });
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

      it('keeps a legacy pending guest pending when an officer edits the group again', async () => {
        await pendingGuest();
        const out = await edit(ACCOUNTANT, {
          action: 'setMiner',
          minerId: 'm-a',
          characterIds: [60, 61],
          mainCharacterId: 60,
        });
        expect(out.pendingConfirmation).toEqual([61]);
        expect(out.officerClaimed).toEqual([]);
        expect((await miner()).get('pendingConfirmation')).toEqual([61]);
        expect((await miner()).get('uids')).toEqual(['char:60']);
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

  describe('confirming a declaration with a payment', () => {
    const declared = async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      const { declarationId } = await edit(ACCOUNTANT, {
        action: 'declare',
        statementId: 's1',
        kind: 'contract',
      });
      await book().collection('payments').doc('j1_1').set({
        id: 'j1_1',
        source: 'donation',
        characterId: 50,
        uid: 'char:50',
        amount: 10_000_000,
        at: '2026-11-02T00:00:00.000Z',
        division: 1,
      });
      return declarationId as string;
    };
    const manual = (declarationId: string) => ({
      action: 'recordPayment',
      paymentId: `m_${declarationId}`,
      minerId: 'solo:50',
      characterId: 50,
      amount: 10_000_000,
      at: '2026-11-02T00:00:00.000Z',
      declarationId,
    });
    const match = (declarationId: string) => ({
      action: 'assignPayment',
      paymentId: 'j1_1',
      minerId: 'solo:50',
      declarationId,
    });
    const resolution = async (id: string) =>
      (await book().collection('declarations').doc(id).get()).get('resolution');

    it('resolves it with the hand-recorded payment, and refuses a donation match after', async () => {
      const id = await declared();
      await edit(ACCOUNTANT, manual(id));
      expect(await resolution(id)).toMatchObject({ kind: 'confirmed', paymentId: `m_${id}` });
      expect(await reason(edit(ACCOUNTANT, match(id)))).toBe('already-resolved');
      expect((await book().collection('payments').doc('j1_1').get()).get('minerId')).toBe(
        undefined
      );
    });

    it('resolves it with a matched donation, and refuses a hand-recorded payment after', async () => {
      const id = await declared();
      await edit(ACCOUNTANT, match(id));
      expect(await resolution(id)).toMatchObject({ kind: 'confirmed', paymentId: 'j1_1' });
      expect(await reason(edit(ACCOUNTANT, manual(id)))).toBe('already-resolved');
      expect((await book().collection('payments').doc(`m_${id}`).get()).exists).toBe(false);
    });

    it("refuses another Miner's declaration", async () => {
      const id = await declared();
      expect(
        await reason(edit(ACCOUNTANT, { ...manual(id), minerId: 'solo:51', characterId: 51 }))
      ).toBe('wrong-miner');
    });
  });

  describe("a Miner's own declaration and dispute (#6206)", () => {
    const declare = (id: number, data: Record<string, unknown>) =>
      declareOwnPayment(deps(), who(id), parseDeclareOwnInput({ corporationId: CORP, ...data }));
    const dispute = (id: number, lines: Record<string, unknown>[], date = '2026-10-17') =>
      disputeConflict(
        deps(),
        who(id),
        parseDisputeConflictInput({ corporationId: CORP, date, lines })
      );
    const line = (characterId: number, overrides: Record<string, unknown> = {}) => ({
      recordKey: `${characterId}:1000:2026-10-17`,
      typeId: 45490,
      quantity: 100,
      payeeName: 'Rival Corp',
      ...overrides,
    });
    // A disputed line must be ore the book recorded (structure 1000, 2026-10-17).
    const recordOre = (...rows: [characterId: number, typeId?: number][]) =>
      syncBook(
        deps(),
        who(ACCOUNTANT),
        parseSyncInput(
          {
            corporationId: CORP,
            observed: rows.map(([characterId, typeId = 45490]) =>
              row(100, '2026-10-18T10:00:00Z', { characterId, typeId })
            ),
          },
          now
        )
      );
    // Members see the book only after its setup window; the officer's access is renewed then.
    const pastSetup = async () => {
      now = T0 + 73 * 3_600_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
    };

    it('declares on the caller’s own open Statement only, once at a time, audited', async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      expect(await reason(declare(50, { statementId: 's1' }))).toBe('no-book');
      await pastSetup();
      // Someone else's Statement looks exactly like a missing one.
      expect(await reason(declare(51, { statementId: 's1' }))).toBe('not-found');
      expect(await reason(declare(50, { statementId: 's404' }))).toBe('not-found');
      const { declarationId } = await declare(50, {
        statementId: 's1',
        amount: 4_000_000,
        note: 'by contract',
      });
      expect((await book().collection('declarations').doc(declarationId).get()).data()).toEqual({
        id: declarationId,
        statementId: 's1',
        kind: 'another-way',
        at: new Date(now).toISOString(),
        recordedBy: 50,
        via: 'player',
        minerId: 'solo:50',
        uids: ['char:50'],
        amount: 4_000_000,
        note: 'by contract',
      });
      expect(await reason(declare(50, { statementId: 's1' }))).toBe('already-declared');
      const entry = (await book().collection('audit').where('action', '==', 'declare').get())
        .docs[0];
      expect(entry.data()).toMatchObject({ by: 50, via: 'player-claim' });
      // Once an officer answers, the Miner may declare again.
      await edit(ACCOUNTANT, {
        action: 'resolveDeclaration',
        declarationId,
        resolution: 'rejected',
        reason: 'no contract',
      });
      await declare(50, { statementId: 's1' });
    });

    it('gives an officer-recorded declaration the Miner’s uids too', async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      const { declarationId } = await edit(ACCOUNTANT, {
        action: 'declare',
        statementId: 's1',
        kind: 'contract',
      });
      expect(
        (
          await book()
            .collection('declarations')
            .doc(declarationId as string)
            .get()
        ).data()
      ).toMatchObject({ minerId: 'solo:50', uids: ['char:50'] });
    });

    it('keeps one dispute per Miner and day, for the caller’s own characters only', async () => {
      await turnOn();
      await recordOre([60], [77, 45491], [50], [99]);
      await edit(ACCOUNTANT, {
        action: 'setMiner',
        minerId: 'm-a',
        characterIds: [60, 77],
        mainCharacterId: 60,
      });
      await pastSetup();
      // A Miner's character disputes for its grouped alt; never for a stranger.
      expect(await reason(dispute(60, [line(99)]))).toBe('not-your-record');
      expect(await dispute(60, [line(60)])).toEqual({ disputeId: 'm-a_2026-10-17' });
      await dispute(77, [line(77, { typeId: 45491 })]);
      const doc = (await book().collection('disputes').doc('m-a_2026-10-17').get()).data();
      expect(doc).toMatchObject({ minerId: 'm-a', date: '2026-10-17', by: 60 });
      expect(doc?.lines).toEqual([line(60), line(77, { typeId: 45491 })]);
      expect([...(doc?.uids as string[])].sort()).toEqual(['char:60', 'char:77']);
      // A solo Miner's day is its own record.
      expect(await dispute(50, [line(50)])).toEqual({ disputeId: 'solo_50_2026-10-17' });
    });

    it('refuses ore the book did not record, or more of it than recorded', async () => {
      await turnOn();
      await recordOre([50]);
      await pastSetup();
      expect(await reason(dispute(50, [line(50, { typeId: 45491 })]))).toBe('not-on-record');
      expect(await reason(dispute(50, [line(50, { quantity: 101 })]))).toBe('not-on-record');
      await dispute(50, [line(50, { quantity: 60 })]);
      // A second call cannot push the day's total past the record.
      expect(await reason(dispute(50, [line(50, { quantity: 41, payeeName: 'Other Corp' })]))).toBe(
        'not-on-record'
      );
      await dispute(50, [line(50, { quantity: 40, payeeName: 'Other Corp' })]);
    });

    // The day's Statement: 100 of ore 45490 at 1,000 ISK, taxed 10%.
    const billDay = () =>
      edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: statement('s1', {
          lines: [
            {
              kind: 'mined',
              date: '2026-10-17',
              chargeKey: '50:1000:2026-10-17',
              characterId: 50,
              structureId: 1000,
              oreLines: [{ typeId: 45490, quantity: 100 }],
              unitPrices: { 45490: 1000 },
              taxPct: 10,
              estimatedValue: 100_000,
              tax: 10_000,
            },
          ],
        }),
      });

    it('waives only the disputed ore, priced on the server, behind the Director limit', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      await verifyOfficer(deps(), who(DIRECTOR), parseBookCall(withToken(DIRECTOR)));
      const { disputeId } = await dispute(50, [line(50, { quantity: 40 })]);
      const waive = { action: 'dismissDispute', disputeId, minerId: 'solo:50', reason: 'Theirs' };
      // 40 × 1,000 × 10% = 4,000: a client's understated 1 ISK does not slip under the limit.
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 3000 } });
      expect(await reason(edit(ACCOUNTANT, { ...waive, amountIsk: 1 }, true))).toBe(
        'director-approval'
      );
      expect(
        await reason(edit(ACCOUNTANT, { ...waive, minerId: 'solo:51', amountIsk: 1 }, true))
      ).toBe('wrong-miner');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 5000 } });
      const { adjustmentId } = await edit(ACCOUNTANT, { ...waive, amountIsk: 1 }, true);
      expect(
        (
          await book()
            .collection('adjustments')
            .doc(adjustmentId as string)
            .get()
        ).data()
      ).toMatchObject({
        minerId: 'solo:50',
        date: '2026-10-17',
        amount: -4000,
        reason: 'Theirs',
        disputeId,
        uids: ['char:50'],
      });
      expect(
        (await book().collection('disputes').doc(disputeId).get()).get('resolution')
      ).toMatchObject({ kind: 'dismissed', by: ACCOUNTANT, reason: 'Theirs', amountIsk: 4000 });
      // No whole-day dismissal is written.
      expect((await book().collection('dismissals').get()).size).toBe(0);
      expect(await reason(edit(ACCOUNTANT, waive, true))).toBe('already-resolved');
    });

    it('waives a day not billed yet only at a Director’s word, or with no limit set', async () => {
      await turnOn();
      await recordOre([50]);
      await pastSetup();
      await verifyOfficer(deps(), who(DIRECTOR), parseBookCall(withToken(DIRECTOR)));
      const { disputeId } = await dispute(50, [line(50, { quantity: 40 })]);
      const waive = { action: 'dismissDispute', disputeId, minerId: 'solo:50', reason: 'Theirs' };
      expect(await reason(edit(ACCOUNTANT, waive, true))).toBe('not-priced');
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 5000 } });
      expect(await reason(edit(ACCOUNTANT, { ...waive, amountIsk: 1 }, true))).toBe(
        'director-approval'
      );
      const { adjustmentId } = await edit(DIRECTOR, { ...waive, amountIsk: 900 }, true);
      expect(
        (
          await book()
            .collection('adjustments')
            .doc(adjustmentId as string)
            .get()
        ).get('amount')
      ).toBe(-900);
    });

    it('lets the Miner withdraw their own unanswered dispute, audited', async () => {
      await turnOn();
      await recordOre([50], [51]);
      await pastSetup();
      const withdraw = (id: number) =>
        withdrawDispute(
          deps(),
          who(id),
          parseWithdrawDisputeInput({ corporationId: CORP, date: '2026-10-17' })
        );
      const { disputeId } = await dispute(50, [line(50)]);
      // Another Miner cannot withdraw it: they have no dispute of their own that day.
      expect(await reason(withdraw(51))).toBe('not-found');
      expect(await withdraw(50)).toEqual({ disputeId });
      // A tombstone: no `lines` (no reader sees a dispute), the hold window and answers kept.
      const gone = (await book().collection('disputes').doc(disputeId).get()).data();
      expect(gone?.lines).toBeUndefined();
      expect(gone).toMatchObject({ minerId: 'solo:50', date: '2026-10-17', uids: ['char:50'] });
      expect(typeof gone?.holdFrom).toBe('string');
      expect(typeof gone?.withdrawnAt).toBe('string');
      expect(
        (await book().collection('audit').where('action', '==', 'withdrawDispute').get()).size
      ).toBe(1);
      expect(await reason(withdraw(50))).toBe('not-found');
      // Once answered, it stays.
      await dispute(50, [line(50)]);
      await edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'Our ore' });
      expect(await reason(withdraw(50))).toBe('answered');
    });

    it('does not let withdrawing and filing again renew the hold, and officers cannot answer a withdrawn day', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      const withdraw = () =>
        withdrawDispute(
          deps(),
          who(50),
          parseWithdrawDisputeInput({ corporationId: CORP, date: '2026-10-17' })
        );
      const { disputeId } = await dispute(50, [line(50, { quantity: 40 })]);
      const first = (await book().collection('disputes').doc(disputeId).get()).get('at');
      // Day 13: withdrawn, and filed again at once.
      now += 13 * 86_400_000;
      await withdraw();
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(
        await reason(edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'Ours' }))
      ).toBe('not-found');
      await dispute(50, [line(50, { quantity: 40 })]);
      const again = (await book().collection('disputes').doc(disputeId).get()).data();
      expect(again?.holdFrom).toBe(first);
      expect(again?.withdrawnAt).toBeUndefined();
      expect(again?.lines).toHaveLength(1);
      expect(again?.history).toEqual([]);
      // Day 15: the first dispute's 14 days are up, so the Statement settles.
      now += 2 * 86_400_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(
        await edit(ACCOUNTANT, { action: 'settleStatements', statementIds: ['s1'] })
      ).toMatchObject({ settled: ['s1'] });
    });

    it('keeps the Miner’s stored totals hold-aware: filing, withdrawing and a lapse recompute them', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      const totals = async () =>
        (await book().collection('minerTotals').doc('solo:50').get()).data();
      const { disputeId } = await dispute(50, [line(50)]);
      const held = await totals();
      expect(held?.owed).toBeLessThan(held?.billed as number);
      expect(typeof held?.overdueAt === 'string' || held?.overdueAt === null).toBe(true);
      await withdrawDispute(
        deps(),
        who(50),
        parseWithdrawDisputeInput({ corporationId: CORP, date: '2026-10-17' })
      );
      expect((await totals())?.owed).toBe(held?.billed);
      // Filed again, then answered: the officer's answer ends the hold.
      await dispute(50, [line(50)]);
      expect((await totals())?.owed).toBeLessThan(held?.billed as number);
      await edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'Ours' });
      expect((await totals())?.owed).toBe(held?.billed);
    });

    it('lets an officer reject a dispute once; the Miner may flag the day again, keeping the hold', async () => {
      await turnOn();
      await recordOre([50]);
      await pastSetup();
      const { disputeId } = await dispute(50, [line(50)]);
      const first = (await book().collection('disputes').doc(disputeId).get()).get('at');
      await edit(ACCOUNTANT, {
        action: 'rejectDispute',
        disputeId,
        reason: 'Our ore',
        nextStep: 'Pay it, or ask in Discord',
      });
      expect(
        (await book().collection('disputes').doc(disputeId).get()).get('resolution')
      ).toMatchObject({ kind: 'rejected', by: ACCOUNTANT, reason: 'Our ore' });
      expect(
        await reason(edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'again' }))
      ).toBe('already-resolved');
      // A minute on: inside the officer's 10-minute verification window, so the second reject runs.
      now += 60_000;
      expect(await dispute(50, [line(50, { quantity: 30 })])).toEqual({ disputeId });
      const again = (await book().collection('disputes').doc(disputeId).get()).data();
      // Open again, its old answer in `history`, the hold window the first dispute's.
      expect(again?.resolution).toBeUndefined();
      expect(again?.lines).toEqual([line(50, { quantity: 30 })]);
      expect(again?.holdFrom).toBe(first);
      expect(again?.at).toBe(new Date(now).toISOString());
      expect(again?.history).toEqual([
        {
          kind: 'payee',
          resolution: expect.objectContaining({
            kind: 'rejected',
            nextStep: 'Pay it, or ask in Discord',
          }),
        },
      ]);
      // Rejected again and filed a third time: the window is still the first one's.
      await edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'Still ours' });
      await dispute(50, [line(50)]);
      const third = (await book().collection('disputes').doc(disputeId).get()).data();
      expect(third?.holdFrom).toBe(first);
      expect(third?.history).toHaveLength(2);
    });

    it('keeps a waived day closed to a new dispute', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      const { disputeId } = await dispute(50, [line(50, { quantity: 40 })]);
      await edit(
        ACCOUNTANT,
        { action: 'dismissDispute', disputeId, minerId: 'solo:50', reason: 'Theirs', amountIsk: 1 },
        true
      );
      expect(await reason(dispute(50, [line(50)]))).toBe('rejected');
    });

    it('drops a Statement an open dispute holds from settleStatements, and settles it once the hold lapses', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      await dispute(50, [line(50, { quantity: 40 })]);
      const settle = () => edit(ACCOUNTANT, { action: 'settleStatements', statementIds: ['s1'] });
      const paid = async () =>
        (await book().collection('meta').doc('paid').get()).data()?.ids ?? [];
      expect(await settle()).toMatchObject({ settled: [] });
      expect(await paid()).not.toContain('s1');
      // The 14-day hold lapses with time alone.
      now += 15 * 86_400_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      expect(await settle()).toMatchObject({ settled: ['s1'] });
      expect(await paid()).toContain('s1');
    });

    it('does not let a re-dispute renew the hold that lapsed', async () => {
      await turnOn();
      await recordOre([50]);
      await billDay();
      await pastSetup();
      const { disputeId } = await dispute(50, [line(50, { quantity: 40 })]);
      await edit(ACCOUNTANT, { action: 'rejectDispute', disputeId, reason: 'Ours' });
      now += 15 * 86_400_000;
      await verifyOfficer(deps(), who(ACCOUNTANT), parseBookCall(withToken(ACCOUNTANT)));
      await dispute(50, [line(50, { quantity: 40 })]);
      expect(
        await edit(ACCOUNTANT, { action: 'settleStatements', statementIds: ['s1'] })
      ).toMatchObject({ settled: ['s1'] });
    });

    describe('an "I already paid" checked against the wallet', () => {
      const paidAt = '2026-10-20T10:00:00.000Z';
      const transfer = (amount: number, journalRef: number) => ({
        amount,
        at: paidAt,
        journalRef,
        recipient: 'corporation',
      });
      const wallet = async () => {
        await book().update({ lastSync: { at: now } });
        for (const [id, amount] of [
          ['j1_1', 4_000_000],
          ['j1_2', 5_000_000],
        ] as const)
          await book().collection('payments').doc(id).set({ characterId: 50, amount, at: paidAt });
      };

      it('credits the transfers it finds at once and leaves the declaration open for the rest', async () => {
        await turnOn();
        await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
        await pastSetup();
        await wallet();
        const out = await declare(50, {
          statementId: 's1',
          transfers: [transfer(4_000_000, 1), transfer(9_000_000, 2)],
        });
        expect(out.checks.map((c) => c.result)).toEqual(['found', 'notFound']);
        expect(out.confirmed).toBe(false);
        const p1 = (await book().collection('payments').doc('j1_1').get()).data();
        expect(p1).toMatchObject({ minerId: 'solo:50', claimedBy: 50 });
        expect((await book().collection('payments').doc('j1_2').get()).get('minerId')).toBe(
          undefined
        );
        const d = (await book().collection('declarations').doc(out.declarationId).get()).data();
        expect(d?.resolution).toBeUndefined();
      });

      it('confirms a declaration whose transfers are all found, and never twice for one payment', async () => {
        await turnOn();
        await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
        await pastSetup();
        await wallet();
        const out = await declare(50, {
          statementId: 's1',
          transfers: [transfer(4_000_000, 1), transfer(5_000_000, 2)],
        });
        expect(out.confirmed).toBe(true);
        expect((await book().collection('payments').doc('j1_2').get()).get('minerId')).toBe(
          'solo:50'
        );
        // The same wallet payments are credited now: a new declaration finds nothing to credit.
        const next = await declare(50, { statementId: 's1', transfers: [transfer(4_000_000, 1)] });
        expect(next.checks[0].result).toBe('notFound');
      });

      it("credits the member's own donation the sync held for review, clearing the hold", async () => {
        await turnOn();
        await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
        await pastSetup();
        await book().update({ lastSync: { at: now } });
        await book().collection('payments').doc('j5_1').set({
          characterId: 50,
          amount: 4_000_000,
          at: paidAt,
          source: 'donation',
          division: 5,
          reviewReason: 'no-open-balance',
        });
        const out = await declare(50, { statementId: 's1', transfers: [transfer(4_000_000, 1)] });
        expect(out.checks).toEqual([{ result: 'found', paymentId: 'j5_1' }]);
        expect(out.confirmed).toBe(true);
        const p = (await book().collection('payments').doc('j5_1').get()).data();
        expect(p).toMatchObject({ minerId: 'solo:50', claimedBy: 50 });
        expect(p?.reviewReason).toBeUndefined();
      });

      it('does not credit when several payments match one transfer', async () => {
        await turnOn();
        await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
        await pastSetup();
        await wallet();
        await book()
          .collection('payments')
          .doc('j1_3')
          .set({ characterId: 50, amount: 4_000_000, at: paidAt });
        const out = await declare(50, { statementId: 's1', transfers: [transfer(4_000_000, 1)] });
        expect(out.checks[0].result).toBe('ambiguous');
        expect((await book().collection('payments').doc('j1_1').get()).get('minerId')).toBe(
          undefined
        );
      });
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

  describe('reversals and exemptions', () => {
    const addCorrection = async (amount = -100) =>
      String(
        (
          await edit(ACCOUNTANT, {
            action: 'addAdjustment',
            minerId: 'solo:50',
            date: '2026-10-05',
            amount,
            reason: 'rounding',
          })
        ).adjustmentId
      );
    const adjustment = async (id: string) =>
      (await book().collection('adjustments').doc(id).get()).data();

    it('reverses a correction, keeps the record, and refuses a second reversal', async () => {
      await turnOn();
      const id = await addCorrection();
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseAdjustment', adjustmentId: id, reason: 'x' })
        )
      ).toBe('live-check-required');
      await edit(
        ACCOUNTANT,
        { action: 'reverseAdjustment', adjustmentId: id, reason: 'twice' },
        true
      );
      expect(await adjustment(id)).toMatchObject({
        amount: -100,
        uids: ['char:50'],
        reversed: { by: ACCOUNTANT, reason: 'twice' },
      });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseAdjustment', adjustmentId: id, reason: 'again' }, true)
        )
      ).toBe('already-reversed');
    });

    it('edits a correction as a reversal plus a replacement', async () => {
      await turnOn();
      const id = await addCorrection();
      const out = await edit(
        ACCOUNTANT,
        {
          action: 'editAdjustment',
          adjustmentId: id,
          date: '2026-10-06',
          amount: -250,
          reason: 'fixed',
        },
        true
      );
      expect((await adjustment(id))?.reversed).toMatchObject({ by: ACCOUNTANT });
      expect(await adjustment(String(out.adjustmentId))).toMatchObject({
        amount: -250,
        date: '2026-10-06',
        replaces: id,
        uids: ['char:50'],
      });
    });

    it('refuses to reverse a correction a Late notice listed, in either collection', async () => {
      await turnOn();
      const id = await addCorrection(500);
      const listed = {
        kind: 'correction',
        date: '2026-10-17',
        oreLines: [],
        estimatedValue: 0,
        tax: 5,
      };
      await book()
        .collection('lateNotices')
        .doc('n9')
        .set({ id: 'n9', minerId: 'solo:50', lines: [{ ...listed, key: `adjustment:${id}` }] });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseAdjustment', adjustmentId: id, reason: 'x' }, true)
        )
      ).toBe('billed-on-statement');
      await book().collection('lateNotices').doc('n9').delete();
      await book()
        .collection('statements')
        .doc('s9')
        .set({
          id: 's9',
          minerId: 'solo:50',
          kind: 'notice',
          lines: [{ ...listed, adjustmentId: id }],
        });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseAdjustment', adjustmentId: id, reason: 'x' }, true)
        )
      ).toBe('billed-on-statement');
      expect((await adjustment(id))?.reversed).toBeUndefined();
    });

    it('reverses a write-off and keeps it', async () => {
      await turnOn();
      const out = await edit(
        ACCOUNTANT,
        { action: 'writeOff', minerId: 'solo:50', amount: 5, reason: 'left' },
        true
      );
      const id = String(out.writeOffId);
      await edit(
        ACCOUNTANT,
        { action: 'reverseWriteOff', writeOffId: id, reason: 'came back' },
        true
      );
      expect((await book().collection('writeOffs').doc(id).get()).data()).toMatchObject({
        amount: 5,
        reversed: { by: ACCOUNTANT, reason: 'came back' },
      });
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseWriteOff', writeOffId: id, reason: 'again' }, true)
        )
      ).toBe('already-reversed');
    });

    it('records a tolerance exemption the Miner can read, and audits it', async () => {
      await turnOn();
      const out = await edit(
        ACCOUNTANT,
        {
          action: 'setToleranceExemption',
          minerId: 'solo:50',
          date: '2026-10-05',
          forgive: 0,
          reason: 'charge it',
        },
        true
      );
      expect(
        (await book().collection('toleranceExemptions').doc(String(out.exemptionId)).get()).data()
      ).toMatchObject({ minerId: 'solo:50', date: '2026-10-05', forgive: 0, uids: ['char:50'] });
      const audit = (await book().collection('audit').orderBy('at').get()).docs.map((d) =>
        d.get('action')
      );
      expect(audit).toContain('setToleranceExemption');
    });

    it('lets a non-Director change only the date or label of a correction under a limit', async () => {
      await turnOn();
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 100 } });
      const id = await addCorrection(-500);
      const out = await edit(
        ACCOUNTANT,
        {
          action: 'editAdjustment',
          adjustmentId: id,
          date: '2026-10-07',
          amount: -500,
          reason: 'moved',
        },
        true
      );
      expect((await adjustment(String(out.adjustmentId)))?.date).toBe('2026-10-07');
    });

    it('refuses an exemption for a Miner that does not exist', async () => {
      await turnOn();
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            {
              action: 'setToleranceExemption',
              minerId: 'grp:nobody',
              date: '2026-10-05',
              forgive: 0,
              reason: 'x',
            },
            true
          )
        )
      ).toBe('unknown-miner');
    });

    it('asks a Director for a change above the approval limit, but not for charging a shortfall', async () => {
      await turnOn();
      await edit(DIRECTOR, { action: 'updateSettings', patch: { dismissApprovalAboveIsk: 100 } });
      const id = await addCorrection(-500);
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'reverseAdjustment', adjustmentId: id, reason: 'x' }, true)
        )
      ).toBe('director-approval');
      expect(
        await reason(
          edit(
            ACCOUNTANT,
            {
              action: 'setToleranceExemption',
              minerId: 'solo:50',
              date: '2026-10-05',
              forgive: 5000,
              reason: 'x',
            },
            true
          )
        )
      ).toBe('director-approval');
      await edit(
        ACCOUNTANT,
        {
          action: 'setToleranceExemption',
          minerId: 'solo:50',
          date: '2026-10-05',
          forgive: 0,
          reason: 'x',
        },
        true
      );
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

    it("deletes every book collection but leaves the corporation's SRP and vetting data untouched", async () => {
      await turnOn();
      await edit(ACCOUNTANT, { action: 'issueStatement', statement: statement('s1') });
      // A nested book collection, and one the delete has never heard of.
      const payouts = () => book().collection('feeders').doc('98000002').collection('payouts');
      await payouts().doc('p1').set({ a: 1 });
      await book().collection('futureBookThing').doc('x').set({ a: 1 });
      for (const name of KEPT_ON_BOOK_DELETE) {
        await book().collection(name).doc('kept').set({ name });
      }

      await deleteBook(deps(), who(DIRECTOR), withToken(DIRECTOR));

      expect((await book().get()).exists).toBe(false);
      const left = (await book().listCollections()).map((c) => c.id).sort();
      expect(left).toEqual([...KEPT_ON_BOOK_DELETE].sort());
      expect(left).toEqual(expect.arrayContaining([...SRP_COLLECTIONS, ...VETTING_COLLECTIONS]));
      for (const name of KEPT_ON_BOOK_DELETE) {
        expect((await book().collection(name).doc('kept').get()).data()).toEqual({ name });
      }
      expect((await payouts().get()).empty).toBe(true);
      // The SRP retention sweep walks `corps` with listDocuments(): the corp must still show up.
      expect((await db.collection('corps').listDocuments()).map((d) => d.id)).toContain(
        String(CORP)
      );

      await turnOn();
      expect((await book().get()).exists).toBe(true);
      expect((await book().collection(SRP_CLAIMS).doc('kept').get()).exists).toBe(true);
    });

    it("removes the book from every Character's billed-by pointer (#4942)", async () => {
      await turnOn();
      const pointer = (id: number) => db.collection('corpTaxBookBilledBy').doc(`char:${id}`);
      const OTHER = '98000777';
      await pointer(501).set({ books: { [String(CORP)]: T0 } });
      await pointer(502).set({ books: { [String(CORP)]: T0, [OTHER]: T0 } });
      await pointer(503).set({ books: { [OTHER]: T0 } });

      await deleteBook(deps(), who(DIRECTOR), withToken(DIRECTOR));

      expect((await pointer(501).get()).exists).toBe(false);
      expect((await pointer(502).get()).data()).toEqual({ books: { [OTHER]: T0 } });
      expect((await pointer(503).get()).data()).toEqual({ books: { [OTHER]: T0 } });
    });

    it('clears a pointer a past delete left behind when the book is turned on again', async () => {
      const stray = db.collection('corpTaxBookBilledBy').doc('char:504');
      await stray.set({ books: { [String(CORP)]: T0 } });
      await turnOn();
      expect((await stray.get()).exists).toBe(false);
    });
  });

  describe('verify link', () => {
    it('shows a running account owed now: the recorded count less what the Miner paid since', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: { ...statement('s1'), kind: 'notice' },
      });
      await edit(ACCOUNTANT, {
        action: 'recordAccounts',
        accounts: [
          { minerId: 'solo:50', owed: 12_000_000, paid: 0, days: 3, oldest: '2026-10-05' },
        ],
      });
      // Synced after the count, whatever its own date: it comes off what is owed now.
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'm1',
        minerId: 'solo:50',
        characterId: 50,
        amount: 2_000_000,
        at: '2026-10-01T00:00:00Z',
      });
      const view = await readStatementByToken(deps(), String(verifyToken));
      expect(view.statement.kind).toBe('notice');
      expect(view.account).toMatchObject({ owed: 10_000_000, days: 3, oldest: '2026-10-05' });
    });

    it('does not write an account again when its figures are unchanged', async () => {
      await turnOn();
      const accounts = [{ minerId: 'solo:50', owed: 5, paid: 0, days: 1, oldest: '2026-10-05' }];
      const doc = () => book().collection('accounts').doc('solo:50');
      await edit(ACCOUNTANT, { action: 'recordAccounts', accounts });
      const first = (await doc().get()).data();
      await edit(ACCOUNTANT, { action: 'recordAccounts', accounts });
      expect((await doc().get()).data()?.at).toBe(first?.at);
      await edit(ACCOUNTANT, {
        action: 'recordAccounts',
        accounts: [{ ...accounts[0], owed: 6 }],
      });
      expect((await doc().get()).data()?.owed).toBe(6);
    });

    describe('stored paid-through (D22)', () => {
      const record = (settledThrough: string, minerId = 'solo:50') =>
        edit(ACCOUNTANT, {
          action: 'recordAccounts',
          accounts: [{ minerId, owed: 0, paid: 0, days: 0, settledThrough }],
        });
      const stored = async () =>
        (await book().collection('meta').doc('paid').get()).data()?.minerPaidThrough ?? {};

      it('only ever moves forward, and never reaches today', async () => {
        await turnOn();
        await record('2026-10-10');
        await record('2026-10-05');
        expect(await stored()).toEqual({ 'solo:50': '2026-10-10' });
        await record('2026-10-18');
        expect(await stored()).toEqual({ 'solo:50': '2026-10-10' });
        await record('2026-10-17');
        expect(await stored()).toEqual({ 'solo:50': '2026-10-17' });
      });

      it('copies each Miner’s paid-through day to a record that Miner can read', async () => {
        await turnOn();
        await record('2026-10-10');
        const copy = (await book().collection('minerPaid').doc('solo:50').get()).data();
        expect(copy).toMatchObject({ id: 'solo:50', paidThrough: '2026-10-10', uids: ['char:50'] });
        await record('2026-10-17');
        expect((await book().collection('minerPaid').doc('solo:50').get()).get('paidThrough')).toBe(
          '2026-10-17'
        );
      });

      it('stops before a day an open dispute holds', async () => {
        await turnOn();
        await book()
          .collection('disputes')
          .doc('d1')
          .set({
            id: 'd1',
            minerId: 'solo:50',
            date: '2026-10-12',
            by: 50,
            at: '2026-10-17T00:00:00Z',
            lines: [{ recordKey: 'k', typeId: 1, quantity: 1, payeeName: 'Pilot' }],
          });
        await record('2026-10-14');
        expect(await stored()).toEqual({});
        await record('2026-10-11');
        expect(await stored()).toEqual({ 'solo:50': '2026-10-11' });
      });
    });

    it('reads a legacy notice by token, and stops reminders with one audited manual reminder allowed', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: { ...statement('s1'), kind: 'notice' },
      });
      await edit(ACCOUNTANT, {
        action: 'recordPayment',
        paymentId: 'm1',
        minerId: 'solo:50',
        characterId: 50,
        amount: 3,
        at: '2026-11-02T00:00:00Z',
      });
      const view = await readStatementByToken(deps(), String(verifyToken));
      expect(view.statement).toMatchObject({ id: 's1', amount: 1, kind: 'notice', code: 'ABC123' });
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
      // A notice takes no money: payments pay the Miner's oldest day.
      expect(view.payments).toEqual([]);
      expect(view.settlement).toBeNull();
      expect(view.settled).toBe(false);
      expect(view.ledger.days).toEqual([{ date: '2026-10-05', tax: 1 }]);
      expect(view.ledger.payments.map((p) => p.id)).toEqual(['m1']);
      expect(view.accountClosed).toBe(false);
      expect(view.remindersStopped).toBe(false);

      await setRemindersByToken(deps(), String(verifyToken), true);
      expect((await readStatementByToken(deps(), String(verifyToken))).remindersStopped).toBe(true);
      expect((await book().collection('lateNotices').doc('s1').get()).get('mail')).toMatchObject({
        remindersStopped: true,
      });
      expect((await book().collection('statements').doc('s1').get()).get('remindersStopped')).toBe(
        true
      );
      // An older tab names the notice as a Statement.
      await edit(ACCOUNTANT, { action: 'recordReminder', statementId: 's1' });
      expect(await reason(edit(ACCOUNTANT, { action: 'recordReminder', noticeId: 's1' }))).toBe(
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
      expect(mailLog).toMatchObject({ detail: { noticeId: 's1', mailId: 99, kind: 'statement' } });
      const stop = log.find((e) => e.action === 'stopReminders');
      expect(stop).toMatchObject({
        by: null,
        via: 'verify-link',
        detail: { noticeId: 's1', stopped: true },
      });
      expect(JSON.stringify(log)).not.toContain(String(verifyToken));
      // Both docs carry the mail while the mirror lives.
      expect((await book().collection('lateNotices').doc('s1').get()).get('mail')).toMatchObject({
        sent: 1,
        manualSent: 1,
        lastAt: expect.any(String),
      });
      expect((await book().collection('statements').doc('s1').get()).data()).toMatchObject({
        mailsSent: 1,
        manualRemindersSent: 1,
      });
    });

    it('flags a Miner whose account is closed', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: { ...statement('s1'), kind: 'notice' },
      });
      await book().collection('miners').doc('solo:50').set({ closedAt: '2026-11-05T00:00:00Z' });
      expect((await readStatementByToken(deps(), String(verifyToken))).accountClosed).toBe(true);
    });

    it('does not resolve a made-up token', async () => {
      expect(await reason(readStatementByToken(deps(), 'x'.repeat(43)))).toBe('invalid-token');
    });
  });
  describe('Late notices (decision 20261120-235011)', () => {
    const notice = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      minerId: 'solo:50',
      characterIds: [50],
      kind: 'late',
      issuedAt: '2026-10-18T09:00:00.000Z',
      code: 'MTCODE01',
      pricing: { hubId: 'jita', oreForm: 'compressed' },
      lines: [
        {
          kind: 'mined',
          date: '2026-10-05',
          key: '50:1000:2026-10-05',
          characterId: 50,
          structureId: 1000,
          oreLines: [{ typeId: 45490, quantity: 100 }],
          unitPrices: { 45490: 1000 },
          estimatedValue: 100_000,
          taxPct: 10,
          tax: 10_000,
        },
      ],
      names: { minerName: 'Ore Pilot' },
      ...overrides,
    });
    const issue = (id: string, overrides?: Record<string, unknown>) =>
      edit(ACCOUNTANT, { action: 'issueLateNotice', notice: notice(id, overrides) });

    it('stores the notice, its link and token, and mirrors both for older tabs', async () => {
      await turnOn();
      const out = await issue('n1', { uids: ['char:666'], issuedBy: 666 });
      expect(out).toMatchObject({ noticeId: 'n1', verifyToken: expect.any(String) });
      const stored = (await book().collection('lateNotices').doc('n1').get()).data();
      expect(stored).toMatchObject({
        id: 'n1',
        minerId: 'solo:50',
        kind: 'late',
        code: 'MTCODE01',
        listed: 10_000,
        // The server names its readers and who issued it, never the tab.
        uids: ['char:50'],
        issuedBy: ACCOUNTANT,
        mail: { sent: 0, manualSent: 0, remindersStopped: false },
        updatedAt: expect.anything(),
      });
      expect((await book().collection('lateNoticeLinks').doc('n1').get()).data()).toEqual({
        token: out.verifyToken,
      });
      expect((await book().collection('statements').doc('n1').get()).data()).toMatchObject({
        id: 'n1',
        kind: 'notice',
        code: 'MTCODE01',
        amount: 10_000,
        uids: ['char:50'],
        lines: [{ chargeKey: '50:1000:2026-10-05' }],
      });
      expect((await book().collection('statementLinks').doc('n1').get()).data()).toEqual({
        verifyToken: out.verifyToken,
      });
      const view = await readStatementByToken(deps(), String(out.verifyToken));
      expect(view.statement).toMatchObject({ id: 'n1', kind: 'notice', minerName: 'Ore Pilot' });
      expect(await reason(issue('n1'))).toBe('notice-exists');
    });

    it('an older tab’s notice is stored as a Late notice too, under the same token', async () => {
      await turnOn();
      const { verifyToken } = await edit(ACCOUNTANT, {
        action: 'issueStatement',
        statement: { ...statement('s1'), kind: 'notice' },
      });
      expect((await book().collection('lateNotices').doc('s1').get()).data()).toMatchObject({
        id: 's1',
        minerId: 'solo:50',
        code: 'ABC123',
        uids: ['char:50'],
        issuedBy: ACCOUNTANT,
      });
      expect((await book().collection('lateNoticeLinks').doc('s1').get()).get('token')).toBe(
        verifyToken
      );
      expect(await reason(issue('s1'))).toBe('notice-exists');
    });

    it('a link keeps working whichever collection holds its notice', async () => {
      await turnOn();
      const { verifyToken } = await issue('n1');
      // Before the backfill, only the legacy doc; after step 5, only the Late notice.
      await book().collection('lateNotices').doc('n1').delete();
      expect((await readStatementByToken(deps(), String(verifyToken))).statement.id).toBe('n1');
      await setRemindersByToken(deps(), String(verifyToken), true);
      expect((await book().collection('statements').doc('n1').get()).get('remindersStopped')).toBe(
        true
      );
      const next = await issue('n2');
      await book().collection('statements').doc('n2').delete();
      expect((await readStatementByToken(deps(), String(next.verifyToken))).statement.id).toBe(
        'n2'
      );
      await edit(ACCOUNTANT, {
        action: 'recordLateNoticeMail',
        noticeId: 'n2',
        mailId: 5,
        kind: 'notice',
      });
      expect((await book().collection('lateNotices').doc('n2').get()).get('mail.sent')).toBe(1);
      expect(
        await reason(
          edit(ACCOUNTANT, {
            action: 'recordLateNoticeMail',
            noticeId: 'n404',
            mailId: 5,
            kind: 'notice',
          })
        )
      ).toBe('not-found');
    });

    it('takes a declaration on a notice, by its id or the old Statement id', async () => {
      await turnOn();
      await issue('n1');
      for (const key of ['noticeId', 'statementId']) {
        const { declarationId } = await edit(ACCOUNTANT, {
          action: 'declare',
          [key]: 'n1',
          kind: 'contract',
        });
        expect(
          (await book().collection('declarations').doc(String(declarationId)).get()).data()
        ).toMatchObject({ statementId: 'n1', minerId: 'solo:50', uids: ['char:50'] });
      }
    });

    it('refuses a final notice for a closed account', async () => {
      await turnOn();
      await book().collection('miners').doc('solo:50').set({ closedAt: '2026-10-17T00:00:00Z' });
      expect(await reason(issue('n1'))).toBe('account-closed');
    });

    describe('recordCheckpoints', () => {
      const checkpoint = (minerId: string, through: string) => ({
        minerId,
        through,
        owed: [],
        credit: 0,
        balance: 0,
        paidThrough: through,
      });
      const record = (...checkpoints: ReturnType<typeof checkpoint>[]) =>
        edit(ACCOUNTANT, { action: 'recordCheckpoints', checkpoints });
      const stored = async (minerId: string) =>
        (await book().collection('accountCheckpoints').doc(minerId).get()).data();

      it('moves only forward, never past what may close today, and skips what it refuses', async () => {
        await turnOn();
        // Today is 18 Oct: the last month at least 31 days closed is August.
        expect(await record(checkpoint('solo:50', '2026-07-31'))).toEqual({
          recorded: ['solo:50'],
        });
        expect(await stored('solo:50')).toMatchObject({
          through: '2026-07-31',
          by: ACCOUNTANT,
          at: new Date(T0).toISOString(),
          uids: ['char:50'],
          updatedAt: expect.anything(),
        });
        const out = await record(
          checkpoint('solo:50', '2026-06-30'),
          checkpoint('solo:51', '2026-09-30'),
          checkpoint('solo:52', '2026-08-31')
        );
        expect(out).toEqual({ recorded: ['solo:52'] });
        expect((await stored('solo:50'))?.through).toBe('2026-07-31');
        expect(await stored('solo:51')).toBeUndefined();
        expect(await record(checkpoint('solo:50', '2026-08-31'))).toEqual({
          recorded: ['solo:50'],
        });
        expect((await stored('solo:50'))?.through).toBe('2026-08-31');
      });

      it('needs an editor', async () => {
        await turnOn();
        expect(
          await reason(
            edit(JUNIOR, {
              action: 'recordCheckpoints',
              checkpoints: [checkpoint('solo:50', '2026-07-31')],
            })
          )
        ).toBe('role-required');
      });
    });

    describe('write-offs forgive the oldest days', () => {
      const dispute = (date: string) =>
        book()
          .collection('disputes')
          .doc(`solo_50_${date}`)
          .set({
            id: `solo_50_${date}`,
            minerId: 'solo:50',
            date,
            by: 50,
            at: '2026-10-17T00:00:00Z',
            lines: [{ recordKey: `50:1000:${date}`, typeId: 1, quantity: 1, payeeName: 'P' }],
          });

      it('pins nothing an older client names, and closes the disputes of the days it forgives', async () => {
        await turnOn();
        await edit(ACCOUNTANT, {
          action: 'recordAccounts',
          accounts: [
            {
              minerId: 'solo:50',
              owed: 300,
              paid: 0,
              days: 2,
              unpaidDays: [
                { date: '2026-10-05', owed: 100, tax: 100 },
                { date: '2026-10-06', owed: 200, tax: 200 },
              ],
            },
          ],
        });
        await dispute('2026-10-05');
        await dispute('2026-10-06');
        const { writeOffId } = await edit(
          ACCOUNTANT,
          { action: 'writeOff', minerId: 'solo:50', statementId: 's1', amount: 150, reason: 'r' },
          true
        );
        expect(
          (await book().collection('writeOffs').doc(String(writeOffId)).get()).data()
        ).not.toHaveProperty('statementId');
        const resolution = async (date: string) =>
          (await book().collection('disputes').doc(`solo_50_${date}`).get()).get('resolution');
        expect(await resolution('2026-10-05')).toMatchObject({ kind: 'dismissed', writeOffId });
        expect(await resolution('2026-10-06')).toBeUndefined();
      });
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

    it('on a running account takes only a late notice as the final bill', async () => {
      await turnOn();
      await edit(DIRECTOR, { action: 'updateSettings', patch: { switchToRunningAccount: true } });
      expect(await reason(close({ statement: statement('final_solo:50') }))).toBe(
        'running-account'
      );
      const out = await close({ statement: { ...statement('final_solo:50'), kind: 'notice' } });
      expect(out).toMatchObject({ statementId: 'final_solo:50' });
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

  describe('Pop Sharing settings (#6222)', () => {
    const popSharing = async () => (await book().collection('meta').doc('popSharing').get()).data();
    const automaticSync = (status: 'active' | 'stopped') =>
      book().collection('meta').doc('scheduledSync').set({ status });
    const moon = () =>
      book().collection('extractions').doc('1000_1').set({ structureId: 1000, moonId: 7 });

    it('refuses turning sharing on without Automatic sync, and allows it with', async () => {
      await turnOn();
      expect(await reason(edit(ACCOUNTANT, { action: 'setPopSharing', enabled: true }))).toBe(
        'needs-automatic-sync'
      );
      await automaticSync('stopped');
      expect(await reason(edit(ACCOUNTANT, { action: 'setPopSharing', enabled: true }))).toBe(
        'needs-automatic-sync'
      );
      await automaticSync('active');
      await edit(ACCOUNTANT, { action: 'setPopSharing', enabled: true });
      expect(await popSharing()).toMatchObject({ enabled: true, updatedBy: ACCOUNTANT });
    });

    it('lets an editor set the default and a Moon override, and keeps each in the history', async () => {
      await turnOn();
      await moon();
      await edit(ACCOUNTANT, {
        action: 'setPopSharing',
        defaults: { popTime: 'auto-fracture', notes: 'Comms in Discord' },
      });
      await edit(ACCOUNTANT, {
        action: 'setPopSharingMoon',
        moonId: 7,
        set: { showOre: false, ratePct: 5 },
      });
      await edit(ACCOUNTANT, {
        action: 'setPopSharingMoon',
        moonId: 7,
        clear: ['ratePct'],
      });
      expect(await popSharing()).toMatchObject({
        enabled: false,
        defaults: { popTime: 'auto-fracture', notes: 'Comms in Discord', showOre: true },
        moons: { '7': { showOre: false } },
      });
      const audit = (await book().collection('audit').get()).docs.map((d) => d.data());
      expect(audit).toContainEqual(
        expect.objectContaining({
          action: 'setPopSharingMoon',
          by: ACCOUNTANT,
          detail: { moonId: 7, set: {}, clear: ['ratePct'] },
        })
      );
      expect(audit).toContainEqual(
        expect.objectContaining({ action: 'setPopSharing', by: ACCOUNTANT })
      );
    });

    it("saves an idle refinery's moon: one Extraction long past, cancelled, or a moon owner's (#6240)", async () => {
      await turnOn();
      const pulls = book().collection('extractions');
      await pulls.doc('1000_1').set({
        structureId: 1000,
        moonId: 7,
        extractionStartTime: '2024-01-01T00:00:00Z',
        naturalDecayTime: '2024-01-07T00:00:00Z',
      });
      await pulls.doc('1001_1').set({
        structureId: 1001,
        moonId: 8,
        extractionStartTime: '2025-03-01T00:00:00Z',
        cancelledAt: '2025-03-02T00:00:00Z',
      });
      await pulls.doc('2000_1').set({ structureId: 2000, moonId: 9, sourceCorporationId: 555 });
      for (const moonId of [7, 8, 9])
        await edit(ACCOUNTANT, { action: 'setPopSharingMoon', moonId, set: { notes: 'idle' } });
      expect((await popSharing())?.moons).toEqual({
        '7': { notes: 'idle' },
        '8': { notes: 'idle' },
        '9': { notes: 'idle' },
      });
    });

    it('refuses a read-only officer, and a moon the book does not handle', async () => {
      await turnOn();
      expect(
        await reason(edit(JUNIOR, { action: 'setPopSharing', defaults: { notes: 'x' } }))
      ).toBe('role-required');
      expect(
        await reason(
          edit(ACCOUNTANT, { action: 'setPopSharingMoon', moonId: 99, set: { notes: 'x' } })
        )
      ).toBe('unknown-moon');
      expect(await popSharing()).toBeUndefined();
    });
  });
});

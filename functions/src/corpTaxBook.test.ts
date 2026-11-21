import { describe, expect, it } from 'vitest';
import {
  rateKey,
  ACCESS_TTL_MS,
  ROLE_CACHE_MS,
  decideRoles,
  dismissalNeedsDirector,
  defaultSettings,
  isCacheFresh,
  moveStartRate,
  parseClaimPaymentInput,
  parseDeclareOwnInput,
  parseDisputeConflictInput,
  disputeIdFor,
  mergeDisputeLines,
  billedDisputeTax,
  disputesClosedByWriteOff,
  checkClaimedTransfer,
  checkpointRefusal,
  handRecordMatch,
  checkClaimedTransfers,
  needsLiveCheck,
  parseEditAction,
  parseSettingsPatch,
  sameDivisions,
  parseStatement,
  parseLateNotice,
  parseSyncInput,
  donationsReadAtPatch,
  parseToken,
  parseTurnOnInput,
  reanchorCadence,
  satisfies,
  startDateMoveReason,
} from './corpTaxBook.js';
import { finalNoticeId, paymentCode } from './corpTaxBookLateNotice.js';

describe('decideRoles (D8)', () => {
  it.each([
    [['Director'], false, { canView: true, canEdit: true, isDirector: true }],
    [['Accountant'], false, { canView: true, canEdit: true, isDirector: false }],
    [['Junior_Accountant'], false, { canView: true, canEdit: false, isDirector: false }],
    [['Station_Manager'], false, { canView: false, canEdit: false, isDirector: false }],
    [[], false, { canView: false, canEdit: false, isDirector: false }],
    [[], true, { canView: true, canEdit: true, isDirector: true }],
  ])('%j (ceo %s)', (roles, ceo, expected) => {
    expect(decideRoles(roles, ceo)).toMatchObject(expected);
  });

  it('lets only a CEO satisfy "ceo", and a Director satisfy "director"', () => {
    expect(satisfies(decideRoles(['Director'], false), 'ceo')).toBe(false);
    expect(satisfies(decideRoles([], true), 'ceo')).toBe(true);
    expect(satisfies(decideRoles(['Accountant'], false), 'director')).toBe(false);
  });

  it('knows Station_Manager from the role, a Director or the CEO', () => {
    expect(decideRoles(['Station_Manager', 'Accountant'], false).isStationManager).toBe(true);
    expect(decideRoles(['Accountant'], false).isStationManager).toBe(false);
    expect(decideRoles(['Director'], false).isStationManager).toBe(true);
  });
});

describe('cache windows', () => {
  it('trusts a role check for at most 10 minutes and access for 24 hours', () => {
    expect(ROLE_CACHE_MS).toBe(600_000);
    expect(ACCESS_TTL_MS).toBe(86_400_000);
    expect(isCacheFresh(1000, 1000 + ROLE_CACHE_MS)).toBe(true);
    expect(isCacheFresh(1000, 1001 + ROLE_CACHE_MS)).toBe(false);
    expect(isCacheFresh(10_000_000, 1000)).toBe(false);
  });
});

describe('defaultSettings (#4059 hand-off)', () => {
  it('sets the book defaults and a start-date rate dated at the start', () => {
    expect(defaultSettings('2026-10-01', 10)).toMatchObject({
      hubId: 'jita',
      oreForm: 'compressed',
      graceHours: 0.5,
      minimumStatement: 5_000_000,
      overdueDays: 14,
      divisions: [1],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
    });
  });
});

describe('parsers', () => {
  it('rejects bad turn-on input', () => {
    const base = { corporationId: 9, startDate: '2026-10-01', startRatePct: 5 };
    expect(parseTurnOnInput(base).startRatePct).toBe(5);
    expect(() => parseTurnOnInput({ ...base, startRatePct: 101 })).toThrow();
    expect(() => parseTurnOnInput({ ...base, startDate: '2026-13-40' })).toThrow();
    expect(() => parseTurnOnInput({ ...base, corporationId: '9' })).toThrow();
  });

  it('markNotTax takes no reason and stores none when blank', () => {
    const base = { action: 'markNotTax', paymentId: 'p1', notTaxAmount: 5 };
    expect(parseEditAction(base)).toEqual(base);
    expect(parseEditAction({ ...base, reason: '  ' })).toEqual(base);
    expect(parseEditAction({ ...base, reason: ' buyback ' })).toMatchObject({ reason: 'buyback' });
  });

  it('refuses a path-escaping id and an unknown action', () => {
    expect(() => parseEditAction({ action: 'dismissAll' })).toThrow();
    expect(() =>
      parseEditAction({ action: 'reverseDismissal', dismissalId: '../x', reason: 'r' })
    ).toThrow();
    expect(() =>
      parseEditAction({ action: 'dismiss', scope: 'record', targetId: 'a', reason: '' })
    ).toThrow();
  });

  it('parses the audit-only recordMail action and bounds it', () => {
    expect(
      parseEditAction({ action: 'recordMail', statementId: 's1', mailId: 77, kind: 'statement' })
    ).toEqual({ action: 'recordMail', statementId: 's1', mailId: 77, kind: 'statement' });
    expect(() =>
      parseEditAction({ action: 'recordMail', statementId: 's1', mailId: 0, kind: 'statement' })
    ).toThrow();
    expect(() =>
      parseEditAction({ action: 'recordMail', statementId: 's1', mailId: 5, kind: 'other' })
    ).toThrow();
  });

  it('wants a main inside the group', () => {
    expect(() =>
      parseEditAction({
        action: 'setMiner',
        minerId: 'm',
        characterIds: [1, 2],
        mainCharacterId: 3,
      })
    ).toThrow();
  });

  it('bounds settings', () => {
    expect(() => parseSettingsPatch({})).toThrow();
    expect(() => parseSettingsPatch({ hubId: 'nowhere' })).toThrow();
    expect(() => parseSettingsPatch({ structureExpiryHours: { '1': 97 } })).toThrow();
    expect(
      parseSettingsPatch({ structureExpiryHours: { '1': 96 }, divisions: [2, 1, 2] })
    ).toMatchObject({
      divisions: [1, 2],
    });
  });

  it('takes the running account switch and bounds its notice rules', () => {
    expect(parseSettingsPatch({ switchToRunningAccount: true })).toEqual({
      switchToRunningAccount: true,
    });
    expect(() => parseSettingsPatch({ switchToRunningAccount: false })).toThrow();
    const rules = { after: { kind: 'dayOfMonth', day: 5 }, minimum: 10_000_000, cooldownDays: 7 };
    expect(parseSettingsPatch({ noticeRules: rules, dayTolerancePct: 0.5 })).toEqual({
      noticeRules: rules,
      dayTolerancePct: 0.5,
    });
    expect(() =>
      parseSettingsPatch({ noticeRules: { ...rules, after: { kind: 'dayOfMonth', day: 31 } } })
    ).toThrow();
    expect(() =>
      parseSettingsPatch({ noticeRules: { ...rules, after: { kind: 'weekly' } } })
    ).toThrow();
    expect(() => parseSettingsPatch({ noticeRules: { ...rules, cooldownDays: 0 } })).toThrow();
    expect(parseSettingsPatch({ noticeRules: { ...rules, earlyAt: 50_000_000 } })).toEqual({
      noticeRules: { ...rules, earlyAt: 50_000_000 },
    });
    expect(() => parseSettingsPatch({ noticeRules: { ...rules, earlyAt: -1 } })).toThrow();
    expect(() => parseSettingsPatch({ dayTolerancePct: 6 })).toThrow();
  });

  it('takes an added division and the divisions list a change started from', () => {
    expect(parseSettingsPatch({ addDivision: 3 })).toEqual({ addDivision: 3 });
    expect(() => parseSettingsPatch({ addDivision: 8 })).toThrow();
    expect(() => parseSettingsPatch({ addDivision: '3' })).toThrow();
    expect(parseSettingsPatch({ divisions: [3, 1], divisionsBase: [2, 1, 2] })).toEqual({
      divisions: [1, 3],
      divisionsBase: [1, 2],
    });
    // A base only says what a new `divisions` list started from.
    expect(() => parseSettingsPatch({ divisionsBase: [1] })).toThrow();
    expect(() => parseSettingsPatch({ divisions: [1], divisionsBase: [9] })).toThrow();
    // `addDivision` adds to the stored list; a base check alongside it would never run.
    expect(() =>
      parseSettingsPatch({ addDivision: 2, divisions: [1, 2], divisionsBase: [1] })
    ).toThrow();
    expect(parseSettingsPatch({ addDivision: 2, divisions: [1, 2] })).toEqual({
      addDivision: 2,
      divisions: [1, 2],
    });
  });

  it('compares divisions lists by the divisions they name', () => {
    expect(sameDivisions([1, 3], [3, 1, 3])).toBe(true);
    expect(sameDivisions([1], [1, 4])).toBe(false);
    expect(sameDivisions([1, 2], [1, 4])).toBe(false);
  });

  it('refuses observer rows from the future', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const row = {
      structureId: 1,
      characterId: 2,
      recordedCorporationId: 3,
      typeId: 4,
      date: '2026-10-19',
      quantity: 1,
      cachedAt: '2026-10-18T11:00:00Z',
    };
    expect(() => parseSyncInput({ corporationId: 9, observed: [row] }, now)).toThrow();
    expect(
      parseSyncInput({ corporationId: 9, observed: [{ ...row, date: '2026-10-18' }] }, now).observed
    ).toHaveLength(1);
  });

  it('stamps when a sync read the wallet, null until one has, and never clears a stamp', () => {
    expect(donationsReadAtPatch(true, 5, 9)).toEqual({ donationsReadAt: 9 });
    expect(donationsReadAtPatch(false, undefined, 9)).toEqual({ donationsReadAt: null });
    expect(donationsReadAtPatch(false, 5, 9)).toEqual({});
    expect(donationsReadAtPatch(false, null, 9)).toEqual({});
    expect(donationsReadAtPatch(undefined, undefined, 9)).toEqual({});
  });

  it('takes whether the sync read the wallet, only as a boolean', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(parseSyncInput({ corporationId: 9, donationsRead: true }, now).donationsRead).toBe(true);
    expect(parseSyncInput({ corporationId: 9, donationsRead: false }, now).donationsRead).toBe(
      false
    );
    expect(parseSyncInput({ corporationId: 9 }, now)).not.toHaveProperty('donationsRead');
    expect(parseSyncInput({ corporationId: 9, donationsRead: 'yes' }, now)).not.toHaveProperty(
      'donationsRead'
    );
  });

  it('takes the donations noted in other divisions, ids from their journal refs (#6207)', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const noted = { refId: 4, division: 2, characterId: 7, amount: 5, at: '2026-10-17T00:00:00Z' };
    expect(parseSyncInput({ corporationId: 9, uncounted: [noted] }, now).uncounted).toEqual([
      { id: 'j2_4', ...noted, at: '2026-10-17T00:00:00.000Z' },
    ]);
    expect('uncounted' in parseSyncInput({ corporationId: 9 }, now)).toBe(false);
    expect(() =>
      parseSyncInput({ corporationId: 9, uncounted: [{ ...noted, division: 8 }] }, now)
    ).toThrow();
    expect(() =>
      parseSyncInput({ corporationId: 9, uncounted: Array(21).fill(noted) }, now)
    ).toThrow();
  });

  it('keeps a donation held for review only when it names no Miner (#6207)', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const donation = {
      refId: 1,
      division: 1,
      characterId: 2,
      amount: 5,
      at: '2026-10-17T00:00:00Z',
      reviewReason: 'no-open-balance',
    };
    const parse = (d: Record<string, unknown>) =>
      parseSyncInput({ corporationId: 9, donations: [d] }, now).donations[0];
    expect(parse(donation).reviewReason).toBe('no-open-balance');
    expect(parse({ ...donation, minerId: 'solo:2' }).reviewReason).toBeUndefined();
    expect(parse({ ...donation, reviewReason: 'other' }).reviewReason).toBeUndefined();
  });

  it('keeps the system and moon an officer client sends with an observer row', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const row = {
      structureId: 1,
      characterId: 2,
      recordedCorporationId: 3,
      typeId: 4,
      date: '2026-10-17',
      quantity: 1,
      cachedAt: '2026-10-18T11:00:00Z',
    };
    const [kept] = parseSyncInput(
      { corporationId: 9, observed: [{ ...row, solarSystemId: 30003838, moonId: 40000001 }] },
      now
    ).observed;
    expect(kept).toMatchObject({ solarSystemId: 30003838, moonId: 40000001 });
    const [bare] = parseSyncInput({ corporationId: 9, observed: [row] }, now).observed;
    expect('solarSystemId' in bare).toBe(false);
    expect('sourceCorporationId' in bare).toBe(false);
    const [fed] = parseSyncInput(
      { corporationId: 9, observed: [{ ...row, sourceCorporationId: 98000002 }] },
      now
    ).observed;
    expect(fed.sourceCorporationId).toBe(98000002);
    expect(() =>
      parseSyncInput({ corporationId: 9, observed: [{ ...row, solarSystemId: 5 }] }, now)
    ).toThrow();
  });

  it('parses a claim and refuses a path-escaping payment id', () => {
    expect(parseClaimPaymentInput({ corporationId: 9, paymentId: 'j1_5' })).toEqual({
      corporationId: 9,
      paymentId: 'j1_5',
    });
    expect(parseClaimPaymentInput({ corporationId: 9, paymentId: 'j5_5', inReview: true })).toEqual(
      { corporationId: 9, paymentId: 'j5_5', inReview: true }
    );
    expect(
      parseClaimPaymentInput({ corporationId: 9, paymentId: 'j5_5', inReview: false })
    ).toEqual({ corporationId: 9, paymentId: 'j5_5' });
    expect(() => parseClaimPaymentInput({ corporationId: 9, paymentId: '../x' })).toThrow();
    expect(() => parseClaimPaymentInput({ corporationId: 0, paymentId: 'a' })).toThrow();
  });

  it('parses a Miner declaring their own Late notice paid: amount and note optional (#6206)', () => {
    expect(parseDeclareOwnInput({ corporationId: 9, noticeId: 's1' })).toEqual({
      corporationId: 9,
      noticeId: 's1',
    });
    expect(
      parseDeclareOwnInput({
        corporationId: 9,
        noticeId: 's1',
        amount: 1500000,
        note: ' sent by contract ',
      })
    ).toEqual({ corporationId: 9, noticeId: 's1', amount: 1500000, note: 'sent by contract' });
    expect(() => parseDeclareOwnInput({ corporationId: 9, statementId: '../x' })).toThrow();
    expect(() =>
      parseDeclareOwnInput({ corporationId: 9, statementId: 's1', amount: 0 })
    ).toThrow();
    expect(() =>
      parseDeclareOwnInput({ corporationId: 9, statementId: 's1', note: 'x'.repeat(501) })
    ).toThrow();
  });

  it('parses a Conflict dispute: one day, its own record keys, the Payee named (#6206)', () => {
    const line = {
      recordKey: '7:1000:2026-11-01',
      typeId: 45490,
      quantity: 1200,
      payeeName: 'Rival Corp',
    };
    expect(
      parseDisputeConflictInput({ corporationId: 9, date: '2026-11-01', lines: [line] })
    ).toEqual({
      corporationId: 9,
      date: '2026-11-01',
      // A client older than kinds sends none: the original payee dispute.
      kind: 'payee',
      lines: [line],
    });
    // A line from another day is not this day's dispute.
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-02',
        lines: [line],
      })
    ).toThrow();
    expect(() =>
      parseDisputeConflictInput({ corporationId: 9, date: '2026-11-01', lines: [] })
    ).toThrow();
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        lines: [{ ...line, quantity: -1 }],
      })
    ).toThrow();
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        lines: [{ ...line, payeeName: '' }],
      })
    ).toThrow();
  });

  it('parses the other kinds: a reason always, a claimed rate for a rate dispute, no Payee', () => {
    const line = { recordKey: '7:1000:2026-11-01', typeId: 45490, quantity: 1200 };
    expect(
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        kind: 'rate',
        reason: 'We agreed 10%',
        claimedPct: 10,
        lines: [line],
      })
    ).toEqual({
      corporationId: 9,
      date: '2026-11-01',
      kind: 'rate',
      reason: 'We agreed 10%',
      claimedPct: 10,
      lines: [{ ...line, payeeName: '' }],
    });
    // Not paying, without saying why, is the member's own hide: nothing reaches the server.
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        kind: 'notPaying',
        lines: [line],
      })
    ).toThrow();
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        kind: 'rate',
        reason: 'r',
        lines: [line],
      })
    ).toThrow();
    expect(() =>
      parseDisputeConflictInput({
        corporationId: 9,
        date: '2026-11-01',
        kind: 'mystery',
        reason: 'r',
        lines: [line],
      })
    ).toThrow();
  });

  it("carries an officer's next step when a bill is kept, and still accepts none", () => {
    expect(
      parseEditAction({
        action: 'rejectDispute',
        disputeId: 'm_2026-11-01',
        reason: 'Book stands',
        nextStep: 'Send the journal screenshot to Imra',
      })
    ).toMatchObject({ nextStep: 'Send the journal screenshot to Imra' });
    expect(
      parseEditAction({ action: 'rejectDispute', disputeId: 'm_2026-11-01', reason: 'r' })
    ).not.toHaveProperty('nextStep');
    expect(
      parseEditAction({
        action: 'resolveDeclaration',
        declarationId: 'x1',
        resolution: 'rejected',
        reason: 'Not in any division',
        nextStep: 'Pay it to the Master wallet',
      })
    ).toMatchObject({ nextStep: 'Pay it to the Master wallet' });
  });

  it('names one dispute per Miner and day, a safe doc id (#6206)', () => {
    expect(disputeIdFor('solo:7', '2026-11-01')).toBe('solo_7_2026-11-01');
    expect(disputeIdFor('m1', '2026-11-01')).toBe('m1_2026-11-01');
  });

  it('parses an officer rejecting a dispute: a reason is required (#6206)', () => {
    expect(
      parseEditAction({ action: 'rejectDispute', disputeId: 'm1_2026-11-01', reason: 'Our ore' })
    ).toEqual({ action: 'rejectDispute', disputeId: 'm1_2026-11-01', reason: 'Our ore' });
    expect(() =>
      parseEditAction({ action: 'rejectDispute', disputeId: 'm1_2026-11-01', reason: '' })
    ).toThrow();
  });

  it('parses an officer waiving a dispute: a priced amount and a reason (#6206)', () => {
    const base = {
      action: 'dismissDispute',
      disputeId: 'm1_2026-11-01',
      minerId: 'm1',
      amountIsk: 1_500_000,
      reason: 'Their ore',
    };
    expect(parseEditAction(base)).toEqual(base);
    // The server prices it; the client's figure is only a fallback, never zero.
    expect(() => parseEditAction({ ...base, amountIsk: 0 })).toThrow();
    const { amountIsk: _a, ...unpriced } = base;
    void _a;
    expect(parseEditAction(unpriced)).toEqual(unpriced);
    expect(() => parseEditAction({ ...base, reason: '' })).toThrow();
    expect(needsLiveCheck(parseEditAction(base))).toBe(true);
  });

  describe('mergeDisputeLines (#6206)', () => {
    const recorded = [
      { characterId: 7, structureId: 1000, date: '2026-11-01', typeId: 45490, quantity: 60 },
      { characterId: 7, structureId: 1000, date: '2026-11-01', typeId: 45490, quantity: 40 },
      { characterId: 7, structureId: 1000, date: '2026-11-01', typeId: 45491, quantity: 10 },
    ];
    const line = (o: Record<string, unknown> = {}) => ({
      recordKey: '7:1000:2026-11-01',
      typeId: 45490,
      quantity: 100,
      payeeName: 'Rival',
      ...o,
    });
    const reasonOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as { details?: { reason?: string } }).details?.reason;
      }
      return undefined;
    };

    it('adds new lines and drops an exact repeat', () => {
      expect(
        mergeDisputeLines([line()], [line(), line({ typeId: 45491, quantity: 10 })], recorded)
      ).toEqual([line(), line({ typeId: 45491, quantity: 10 })]);
    });

    it('refuses ore the record does not hold, or more of it than recorded', () => {
      expect(reasonOf(() => mergeDisputeLines([], [line({ typeId: 1 })], recorded))).toBe(
        'not-on-record'
      );
      expect(
        reasonOf(() => mergeDisputeLines([], [line({ recordKey: '7:2000:2026-11-01' })], recorded))
      ).toBe('not-on-record');
      expect(reasonOf(() => mergeDisputeLines([], [line({ quantity: 101 })], recorded))).toBe(
        'not-on-record'
      );
      // Split between two Payees across calls, the total still cannot pass the record.
      expect(
        reasonOf(() =>
          mergeDisputeLines(
            [line({ quantity: 60 })],
            [line({ quantity: 50, payeeName: 'B' })],
            recorded
          )
        )
      ).toBe('not-on-record');
    });

    it('caps the lines one day holds across every call', () => {
      const many = Array.from({ length: 100 }, (_, i) => line({ quantity: 1, payeeName: `P${i}` }));
      const big = [{ ...recorded[0], quantity: 1000 }];
      expect(mergeDisputeLines([], many, big)).toHaveLength(100);
      expect(
        reasonOf(() => mergeDisputeLines(many, [line({ quantity: 1, payeeName: 'X' })], big))
      ).toBe('too-many-lines');
    });
  });

  describe('disputesClosedByWriteOff: a write-off answers the disputes of the days it forgives (#6307)', () => {
    // The Miner's account as it stands now: what each unpaid day still owes, oldest first.
    const live = {
      owed: 900_000,
      unpaidDays: [
        { date: '2026-11-01', owed: 400_000, tax: 400_000 },
        { date: '2026-11-02', owed: 300_000, tax: 500_000 },
        { date: '2026-11-09', owed: 200_000, tax: 200_000 },
      ],
    };
    const dispute = (id: string, date: string, resolution?: unknown) => ({ id, date, resolution });
    const disputes = [
      dispute('a', '2026-11-01'),
      dispute('b', '2026-11-02'),
      dispute('c', '2026-11-09'),
      dispute('d', '2026-11-01', { kind: 'rejected' }),
    ];

    it('forgives the oldest days first, held days too: their open disputes close', () => {
      expect(disputesClosedByWriteOff(disputes, { amount: 700_000 }, live)).toEqual(['a', 'b']);
      expect(disputesClosedByWriteOff(disputes, { amount: 500_000 }, live)).toEqual(['a']);
    });

    it('a day only partly forgiven keeps its dispute open', () => {
      expect(disputesClosedByWriteOff(disputes, { amount: 300_000 }, live)).toEqual([]);
    });

    it('a write-off of the whole balance closes every open dispute', () => {
      expect(disputesClosedByWriteOff(disputes, { amount: 900_000 }, live)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('closes none when the account’s days are unknown', () => {
      expect(disputesClosedByWriteOff(disputes, { amount: 1 })).toEqual([]);
      expect(disputesClosedByWriteOff(disputes, { amount: 10_000_000 }, { owed: 5 })).toEqual([]);
    });
  });

  describe('billedDisputeTax: a waived dispute priced from the Late notices that listed it', () => {
    const disputed = {
      lines: [
        { recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 100, payeeName: 'A' },
        { recordKey: '77:1000:2026-11-01', typeId: 45491, quantity: 50, payeeName: 'A' },
      ],
    };
    const mined = (key: string, typeId: number, quantity: number, taxPct = 10) => ({
      kind: 'mined',
      date: '2026-11-01',
      key,
      oreLines: [{ typeId, quantity }],
      unitPrices: { [typeId]: typeId === 45490 ? 1000 : 2000 },
      taxPct,
    });

    it('prices the disputed ore at the prices and rate the notice listed it at', () => {
      const notices = [
        { lines: [mined('60:1000:2026-11-01', 45490, 100)] },
        { lines: [mined('77:1000:2026-11-01', 45491, 50, 20)] },
      ];
      // 100 × 1000 × 10% + 50 × 2000 × 20%
      expect(billedDisputeTax(disputed, notices)).toBe(30_000);
    });

    it('caps the disputed ore at what the notices listed, late ore included', () => {
      const late = { ...mined('60:1000:2026-11-01', 45490, 30), kind: 'late-ore' };
      const notices = [
        { lines: [mined('60:1000:2026-11-01', 45490, 40), late] },
        { lines: [mined('77:1000:2026-11-01', 45491, 50)] },
      ];
      expect(billedDisputeTax(disputed, notices)).toBe(70 * 100 + 50 * 200);
    });

    it('cannot price a disputed record no notice listed yet', () => {
      expect(
        billedDisputeTax(disputed, [{ lines: [mined('60:1000:2026-11-01', 45490, 100)] }])
      ).toBeUndefined();
      expect(billedDisputeTax(disputed, [])).toBeUndefined();
    });

    // A rate dispute is about the rate: waiving it credits the gap, never the whole tax.
    it('prices a rate dispute as the gap between the billed and claimed rates', () => {
      const notices = [{ lines: [mined('60:1000:2026-11-01', 45490, 100, 12)] }];
      const rate = {
        kind: 'rate' as const,
        claimedPct: 10,
        lines: [{ recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 100 }],
      };
      expect(billedDisputeTax(rate, notices)).toBeCloseTo(100 * 1000 * 0.02);
      expect(billedDisputeTax({ ...rate, claimedPct: 15 }, notices)).toBe(0);
    });

    it('ignores correction lines and malformed lines', () => {
      const notices = [
        {
          lines: [
            { kind: 'correction', date: '2026-11-01', key: 'adjustment:a1', tax: -5 },
            { kind: 'mined', key: '77:1000:2026-11-01' },
            mined('60:1000:2026-11-01', 45490, 100),
          ],
        },
      ];
      expect(billedDisputeTax(disputed, notices)).toBeUndefined();
    });
  });

  it('records a hand payment with no notice on it, whatever an older tab sends', () => {
    const payment = {
      action: 'recordPayment',
      paymentId: 'm_x1',
      minerId: 'm1',
      characterId: 7,
      amount: 5,
      at: '2026-11-01T00:00:00.000Z',
      statementId: 's1',
    };
    expect(parseEditAction(payment)).not.toHaveProperty('statementId');
  });

  it('moves a payment to another Miner, or back to Unmatched, re-checking the role live', () => {
    const move = parseEditAction({ action: 'reassignPayment', paymentId: 'j1_1', minerId: 'm2' });
    expect(move).toEqual({ action: 'reassignPayment', paymentId: 'j1_1', minerId: 'm2' });
    expect(
      parseEditAction({ action: 'reassignPayment', paymentId: 'j1_1', minerId: null })
    ).toEqual({ action: 'reassignPayment', paymentId: 'j1_1', minerId: null });
    expect(needsLiveCheck(move)).toBe(true);
    expect(() => parseEditAction({ action: 'reassignPayment', paymentId: 'j1_1' })).toThrow();
  });

  it('syncs a donation with no Miner or notice the client named: the server decides', () => {
    const input = parseSyncInput(
      {
        corporationId: 1,
        donations: [
          {
            refId: 1,
            division: 1,
            characterId: 7,
            amount: 5,
            at: '2026-11-01T00:00:00Z',
            minerId: 'solo:7',
            statementId: 's1',
          },
        ],
      },
      Date.parse('2026-11-02T00:00:00Z')
    );
    expect(input.donations[0]).not.toHaveProperty('minerId');
    expect(input.donations[0]).not.toHaveProperty('statementId');
  });

  it('parses a manual payment or a donation match that confirms a declaration', () => {
    const payment = {
      action: 'recordPayment',
      paymentId: 'm_x1',
      minerId: 'm1',
      characterId: 7,
      amount: 5,
      at: '2026-11-01T00:00:00.000Z',
      declarationId: 'x1',
    };
    expect(parseEditAction(payment)).toMatchObject({ declarationId: 'x1' });
    expect(
      parseEditAction({
        action: 'assignPayment',
        paymentId: 'j1_1',
        minerId: 'm1',
        declarationId: 'x1',
      })
    ).toEqual({ action: 'assignPayment', paymentId: 'j1_1', minerId: 'm1', declarationId: 'x1' });
    expect(parseEditAction({ action: 'assignPayment', paymentId: 'j1_1', minerId: 'm1' })).toEqual({
      action: 'assignPayment',
      paymentId: 'j1_1',
      minerId: 'm1',
    });
  });

  it('accepts only a 43-character url-safe token', () => {
    expect(parseToken({ token: 'a'.repeat(43) })).toHaveLength(43);
    expect(() => parseToken({ token: 'short' })).toThrow();
  });

  it('keeps the Statement fields the book relies on', () => {
    expect(() => parseStatement({ id: 's' })).toThrow();
  });

  describe('display names for the verify page', () => {
    const raw = {
      id: 's1',
      minerId: 'solo:1',
      code: 'MT1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      coversFrom: '2026-08-01',
      coversThrough: '2026-08-31',
      issuedAt: '2026-09-01T00:00:00Z',
      hubId: 'jita',
      oreForm: 'compressed',
      lines: [],
      amount: 5,
      characterIds: [1],
    };

    it('keeps the corporation, Miner and refinery names, typed and bounded', () => {
      const parsed = parseStatement({
        ...raw,
        corporationName: 'Brass Meridian',
        minerName: 'Varro',
        refineryNames: { '77': 'Efa V - Moon 3' },
      });
      expect(parsed).toMatchObject({
        corporationName: 'Brass Meridian',
        minerName: 'Varro',
        refineryNames: { '77': 'Efa V - Moon 3' },
      });
    });

    it('refuses names that are not strings or too many refineries', () => {
      expect(() => parseStatement({ ...raw, minerName: 5 })).toThrow();
      expect(() => parseStatement({ ...raw, refineryNames: { x: 'bad id' } })).toThrow();
      const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [String(i + 1), 'r']));
      expect(() => parseStatement({ ...raw, refineryNames: many })).toThrow();
    });
  });

  describe('closeAccount (#4184)', () => {
    const close = (credit: unknown) => ({
      action: 'closeAccount',
      minerId: 'solo:50',
      reason: 'Left the area',
      credit,
    });

    it('refunds by default and needs no live role check', () => {
      const action = parseEditAction(close({ kind: 'refund' }));
      expect(action).toMatchObject({ action: 'closeAccount', credit: { kind: 'refund' } });
      expect(needsLiveCheck(action)).toBe(false);
    });

    it('re-checks the role live when it forfeits', () => {
      const consent = parseEditAction(
        close({ kind: 'forfeit', basis: { kind: 'consent', note: 'agreed' } })
      );
      const silent = parseEditAction(
        close({ kind: 'forfeit', basis: { kind: 'no-reply', askedAt: '2026-07-01' } })
      );
      expect(needsLiveCheck(consent)).toBe(true);
      expect(needsLiveCheck(silent)).toBe(true);
    });

    it('refuses a forfeit with no stated basis', () => {
      expect(() => parseEditAction(close({ kind: 'forfeit' }))).toThrow();
      expect(() =>
        parseEditAction(close({ kind: 'forfeit', basis: { kind: 'no-reply', askedAt: 'soon' } }))
      ).toThrow();
      expect(() => parseEditAction(close({ kind: 'keep' }))).toThrow();
    });
  });
});

describe('dismissalNeedsDirector (D6, #4194)', () => {
  it('is never needed without a limit, or for a Director', () => {
    expect(dismissalNeedsDirector(null, [9e12], false)).toBe(false);
    expect(dismissalNeedsDirector(100, [9e12], true)).toBe(false);
  });

  it('checks the limit against the total of a multi-day dismissal, not each day', () => {
    expect(dismissalNeedsDirector(100, [60, 60], false)).toBe(true);
    expect(dismissalNeedsDirector(100, [40, 60], false)).toBe(false);
  });

  it('counts an omitted amount as over the limit', () => {
    expect(dismissalNeedsDirector(100, [1, undefined], false)).toBe(true);
  });

  it('counts a zero amount as unpriced, so a day not in view cannot slip under the limit', () => {
    expect(dismissalNeedsDirector(100, [1, 0], false)).toBe(true);
    expect(dismissalNeedsDirector(null, [0], false)).toBe(false);
  });
});

describe('dismissRecords', () => {
  it('parses a bounded batch with a reason', () => {
    expect(
      parseEditAction({
        action: 'dismissRecords',
        targets: [{ targetId: '1:2:2026-10-01', amountIsk: 5 }],
        reason: 'r',
      })
    ).toEqual({
      action: 'dismissRecords',
      targets: [{ targetId: '1:2:2026-10-01', amountIsk: 5 }],
      reason: 'r',
    });
    expect(() => parseEditAction({ action: 'dismissRecords', targets: [], reason: 'r' })).toThrow();
    expect(() =>
      parseEditAction({
        action: 'dismissRecords',
        targets: [{ targetId: 'a', amountIsk: 1 }],
        reason: '',
      })
    ).toThrow();
  });
});

describe('regroupMiner', () => {
  it('parses a fold of stored Miners into one', () => {
    expect(
      parseEditAction({
        action: 'regroupMiner',
        minerId: 'solo:1',
        characterIds: [1, 2, 2],
        mainCharacterId: 2,
        absorbMinerIds: ['g1', 'g1'],
      })
    ).toEqual({
      action: 'regroupMiner',
      minerId: 'solo:1',
      characterIds: [1, 2],
      mainCharacterId: 2,
      absorbMinerIds: ['g1'],
    });
  });

  it('refuses a main outside the group and a Miner absorbing itself', () => {
    const base = { action: 'regroupMiner', minerId: 'g0', absorbMinerIds: [] };
    expect(() => parseEditAction({ ...base, characterIds: [1], mainCharacterId: 9 })).toThrow();
    expect(() =>
      parseEditAction({ ...base, characterIds: [1], mainCharacterId: 1, absorbMinerIds: ['g0'] })
    ).toThrow();
  });
});

describe('setFullyMined', () => {
  it('parses set and clear, and refuses a non-boolean or a path-escaping id', () => {
    expect(
      parseEditAction({ action: 'setFullyMined', extractionId: 'x_1', fullyMined: true })
    ).toEqual({
      action: 'setFullyMined',
      extractionId: 'x_1',
      fullyMined: true,
    });
    expect(
      parseEditAction({ action: 'setFullyMined', extractionId: 'x_1', fullyMined: false })
    ).toEqual({
      action: 'setFullyMined',
      extractionId: 'x_1',
      fullyMined: false,
    });
    expect(() =>
      parseEditAction({ action: 'setFullyMined', extractionId: 'x_1', fullyMined: 'yes' })
    ).toThrow();
    expect(() =>
      parseEditAction({ action: 'setFullyMined', extractionId: '../x', fullyMined: true })
    ).toThrow();
  });
});

describe('linkSurvey', () => {
  it('parses a link and an unlink, and refuses a path-escaping id', () => {
    expect(
      parseEditAction({ action: 'linkSurvey', extractionId: 'x_1', surveyId: 'abc123' })
    ).toEqual({
      action: 'linkSurvey',
      extractionId: 'x_1',
      surveyId: 'abc123',
    });
    expect(parseEditAction({ action: 'linkSurvey', extractionId: 'x_1', surveyId: null })).toEqual({
      action: 'linkSurvey',
      extractionId: 'x_1',
      surveyId: null,
    });
    expect(() =>
      parseEditAction({ action: 'linkSurvey', extractionId: 'x_1', surveyId: '../s' })
    ).toThrow();
  });
});

describe('per-refinery rate (#4621)', () => {
  it('parses a structure-scoped rate with its structure id', () => {
    expect(
      parseEditAction({
        action: 'addRate',
        rate: {
          scope: 'structure',
          structureId: 1035000000001,
          pct: 4,
          effectiveFrom: '2026-10-18',
        },
      })
    ).toEqual({
      action: 'addRate',
      rate: { scope: 'structure', structureId: 1035000000001, pct: 4, effectiveFrom: '2026-10-18' },
    });
    expect(() =>
      parseEditAction({
        action: 'addRate',
        rate: { scope: 'structure', pct: 4, effectiveFrom: '2026-10-18' },
      })
    ).toThrow();
  });
});

describe('addRates (#6323)', () => {
  const a = { scope: 'guest', pct: 5, effectiveFrom: '2026-10-21' } as const;
  const b = { scope: 'miner', minerId: 'm1', pct: 7, effectiveFrom: '2026-10-21' } as const;

  it('parses a list of dated rates', () => {
    expect(parseEditAction({ action: 'addRates', rates: [a, b] })).toEqual({
      action: 'addRates',
      rates: [a, b],
    });
  });

  it('refuses an empty list, a non-list, and a bad rate in the list', () => {
    expect(() => parseEditAction({ action: 'addRates', rates: [] })).toThrow();
    expect(() => parseEditAction({ action: 'addRates', rates: a })).toThrow();
    expect(() =>
      parseEditAction({ action: 'addRates', rates: [a, { ...b, minerId: '' }] })
    ).toThrow();
  });
});

describe('per-moon-owner miner rate', () => {
  it('parses a feeder-scoped rate with its moon owner corporation id', () => {
    expect(
      parseEditAction({
        action: 'addRate',
        rate: { scope: 'feeder', feederId: 98000002, pct: 9, effectiveFrom: '2026-10-21' },
      })
    ).toEqual({
      action: 'addRate',
      rate: { scope: 'feeder', feederId: 98000002, pct: 9, effectiveFrom: '2026-10-21' },
    });
    expect(() =>
      parseEditAction({
        action: 'addRate',
        rate: { scope: 'feeder', pct: 9, effectiveFrom: '2026-10-21' },
      })
    ).toThrow();
  });

  it("parses a rate for the moon owner's own members, keyed apart from its per-moon-owner rate (#6210)", () => {
    const rate = {
      scope: 'feeder-member',
      feederId: 98000002,
      pct: 4,
      effectiveFrom: '2026-10-21',
    } as const;
    expect(parseEditAction({ action: 'addRate', rate })).toEqual({ action: 'addRate', rate });
    expect(() =>
      parseEditAction({ action: 'addRate', rate: { ...rate, feederId: undefined } })
    ).toThrow();
    expect(rateKey(rate)).not.toBe(rateKey({ ...rate, scope: 'feeder' }));
    expect(rateKey(rate)).not.toBe(rateKey({ ...rate, feederId: 98000003 }));
  });
});

describe('moveStartRate', () => {
  it('re-dates the corp-default rate dated at the old start', () => {
    expect(
      moveStartRate(
        [
          { scope: 'corp', pct: 10, effectiveFrom: '2026-10-10' },
          { scope: 'corp', pct: 12, effectiveFrom: '2026-10-20' },
        ],
        '2026-10-10',
        '2026-10-01'
      )
    ).toEqual([
      { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
      { scope: 'corp', pct: 12, effectiveFrom: '2026-10-20' },
    ]);
  });

  it('keeps one rate when another already sits at the new start', () => {
    const out = moveStartRate(
      [
        { scope: 'corp', pct: 8, effectiveFrom: '2026-10-01' },
        { scope: 'corp', pct: 10, effectiveFrom: '2026-10-10' },
      ],
      '2026-10-10',
      '2026-10-01'
    );
    expect(out).toEqual([{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }]);
  });
});

describe('startDateMoveReason (CX-23)', () => {
  const st = (coversFrom: string, coversThrough: string) => ({
    id: 's',
    coversFrom,
    coversThrough,
    lines: [],
  });
  const today = '2026-10-23';
  it('allows moving earlier, never into the future or before the leave day', () => {
    expect(startDateMoveReason('2026-10-10', '2026-10-01', today, null, [])).toBeNull();
    expect(startDateMoveReason('2026-10-10', '2026-10-24', today, null, [])).toBe(
      'start-in-future'
    );
    expect(startDateMoveReason('2026-10-10', '2026-10-01', today, '2026-10-05', [])).toBe(
      'start-before-leave'
    );
  });
  it('allows moving later only when no Statement covers the gap', () => {
    expect(startDateMoveReason('2026-10-01', '2026-10-10', today, null, [])).toBeNull();
    expect(
      startDateMoveReason('2026-10-01', '2026-10-10', today, null, [st('2026-10-10', '2026-10-15')])
    ).toBeNull();
    expect(
      startDateMoveReason('2026-10-01', '2026-10-10', today, null, [st('2026-10-05', '2026-10-12')])
    ).toBe('start-over-billed');
  });
});

describe('settings patch: start date and member visibility', () => {
  it('parses a start date and the show-to-members flag', () => {
    expect(parseSettingsPatch({ startDate: '2026-10-01' })).toEqual({ startDate: '2026-10-01' });
    expect(parseSettingsPatch({ showToMembers: true })).toEqual({ showToMembers: true });
    expect(() => parseSettingsPatch({ startDate: 'x' })).toThrow();
    expect(() => parseSettingsPatch({ showToMembers: false })).toThrow();
  });

  it("takes who answers members' tax questions, null clearing it", () => {
    const list = { kind: 'mailingList', id: 7, name: ' Desk ' };
    expect(parseSettingsPatch({ taxContact: list })).toEqual({
      taxContact: { kind: 'mailingList', id: 7, name: 'Desk' },
    });
    expect(parseSettingsPatch({ taxContact: { kind: 'characters', ids: [3, 4, 3] } })).toEqual({
      taxContact: { kind: 'characters', ids: [3, 4] },
    });
    expect(parseSettingsPatch({ taxContact: null })).toEqual({ taxContact: null });
    for (const bad of [
      'x',
      [],
      { kind: 'other' },
      { kind: 'mailingList', id: 0, name: 'x' },
      { kind: 'mailingList', id: 7, name: '  ' },
      { kind: 'mailingList', id: 7 },
      { kind: 'characters', ids: [] },
      { kind: 'characters', ids: [1, 2, 3, 4, 5, 6] },
      { kind: 'characters', ids: [1.5] },
      { kind: 'characters', ids: [-1] },
      { kind: 'characters', ids: [0, 3] },
      { kind: 'characters', ids: 'x' },
    ]) {
      expect(() => parseSettingsPatch({ taxContact: bad })).toThrow();
    }
  });

  it('takes the wallet division names a Director read (#6161)', () => {
    expect(parseSettingsPatch({ divisionNames: { '1': ' Master ', '5': 'MOON TAXES' } })).toEqual({
      divisionNames: { '1': 'Master', '5': 'MOON TAXES' },
    });
    // An empty map clears the names: the corp reset them to defaults.
    expect(parseSettingsPatch({ divisionNames: {} })).toEqual({ divisionNames: {} });
    expect(() => parseSettingsPatch({ divisionNames: { '8': 'x' } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: { '0': 'x' } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: { one: 'x' } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: { '2': '   ' } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: { '2': 7 } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: { '2': 'x'.repeat(51) } })).toThrow();
    expect(() => parseSettingsPatch({ divisionNames: ['x'] })).toThrow();
  });
});

describe('reanchorCadence', () => {
  const days = { kind: 'days', days: 7, anchor: '2026-10-01' };
  it('moves an N-day anchor that sat on the old start to the new start', () => {
    expect(reanchorCadence(days, '2026-10-01', '2026-09-25')).toEqual({
      kind: 'days',
      days: 7,
      anchor: '2026-09-25',
    });
  });
  it('leaves a custom anchor, a monthly cadence and no cadence alone', () => {
    expect(reanchorCadence(days, '2026-09-01', '2026-09-25')).toBe(days);
    const monthly = { kind: 'monthly' };
    expect(reanchorCadence(monthly, '2026-10-01', '2026-09-25')).toBe(monthly);
    expect(reanchorCadence(undefined, '2026-10-01', '2026-09-25')).toBeUndefined();
  });
});

describe('Pop Sharing edits (#6222)', () => {
  it('parses turning sharing on and a Sharing default change', () => {
    expect(
      parseEditAction({
        action: 'setPopSharing',
        enabled: true,
        defaults: {
          audiences: [{ kind: 'corp' }, { kind: 'community', communityId: 'c1', name: ' Miners ' }],
          popTime: 'auto-fracture',
          showOre: false,
          ratePct: 7.5,
          notes: '  Fleet on comms  ',
        },
      })
    ).toEqual({
      action: 'setPopSharing',
      enabled: true,
      defaults: {
        audiences: [{ kind: 'corp' }, { kind: 'community', communityId: 'c1', name: 'Miners' }],
        popTime: 'auto-fracture',
        showOre: false,
        ratePct: 7.5,
        notes: 'Fleet on comms',
      },
    });
  });

  it('takes empty notes, the book rate (null) and a lone switch', () => {
    expect(
      parseEditAction({ action: 'setPopSharing', defaults: { notes: '', ratePct: null } })
    ).toEqual({ action: 'setPopSharing', defaults: { notes: '', ratePct: null } });
    expect(parseEditAction({ action: 'setPopSharing', enabled: false })).toEqual({
      action: 'setPopSharing',
      enabled: false,
    });
  });

  it('refuses nothing to change, a bad value, a duplicate audience or an unknown setting', () => {
    const bad = (data: Record<string, unknown>) =>
      expect(() => parseEditAction({ action: 'setPopSharing', ...data })).toThrow();
    bad({});
    bad({ enabled: 'yes' });
    bad({ defaults: { popTime: 'whenever' } });
    bad({ defaults: { ratePct: 101 } });
    bad({ defaults: { notes: 'x'.repeat(501) } });
    bad({ defaults: { audiences: [{ kind: 'corp' }, { kind: 'corp' }] } });
    bad({ defaults: { audiences: [{ kind: 'community', communityId: '../x', name: 'a' }] } });
    bad({ defaults: { colour: 'red' } });
  });

  it('parses a Moon override: settings to set, and settings back to the default', () => {
    expect(
      parseEditAction({
        action: 'setPopSharingMoon',
        moonId: 40001,
        set: { popTime: 'ready', ratePct: null },
        clear: ['notes'],
      })
    ).toEqual({
      action: 'setPopSharingMoon',
      moonId: 40001,
      override: { set: { popTime: 'ready', ratePct: null }, clear: ['notes'] },
    });
    const bad = (data: Record<string, unknown>) =>
      expect(() =>
        parseEditAction({ action: 'setPopSharingMoon', moonId: 40001, ...data })
      ).toThrow();
    bad({});
    bad({ set: {}, clear: [] });
    bad({ clear: ['colour'] });
    bad({ set: { notes: 'a' }, clear: ['notes'] });
    expect(() =>
      parseEditAction({ action: 'setPopSharingMoon', moonId: 'x', set: { notes: 'a' } })
    ).toThrow();
  });
});

// Resolving in the app: an "I already paid" is checked against what the book synced of the
// corporation's wallet before any officer sees it.
describe('checkClaimedTransfer', () => {
  const transfer = {
    amount: 25_000_000,
    at: '2026-11-02T18:41:00.000Z',
    journalRef: 7_788_991,
    recipient: 'corporation' as const,
  };
  const ctx = {
    senderIds: [7],
    payments: [] as {
      id: string;
      characterId?: number;
      amount: number;
      at: string;
      minerId?: string;
    }[],
    uncounted: [] as { characterId: number; amount: number; at: string; division: number }[],
    lastSyncAt: Date.parse('2026-11-16T14:00:00.000Z'),
  };

  it('finds a payment the book holds from the sender, even a day apart', () => {
    const payments = [
      { id: 'j1_9', characterId: 7, amount: 25_000_000, at: '2026-11-03T10:00:00.000Z' },
    ];
    expect(checkClaimedTransfer(transfer, { ...ctx, payments })).toEqual({
      result: 'found',
      paymentId: 'j1_9',
    });
  });

  it('finds it in a division the book does not read', () => {
    const uncounted = [{ characterId: 7, amount: 25_000_000, at: transfer.at, division: 3 }];
    expect(checkClaimedTransfer(transfer, { ...ctx, uncounted })).toEqual({
      result: 'division',
      division: 3,
    });
  });

  it('never matches another sender or another amount', () => {
    const payments = [
      { id: 'a', characterId: 8, amount: 25_000_000, at: transfer.at },
      { id: 'b', characterId: 7, amount: 24_000_000, at: transfer.at },
    ];
    expect(checkClaimedTransfer(transfer, { ...ctx, payments }).result).toBe('notFound');
  });

  it('says the book has not synced since, rather than not found, for a transfer after the last sync', () => {
    expect(checkClaimedTransfer({ ...transfer, at: '2026-11-16T15:00:00.000Z' }, ctx).result).toBe(
      'notSynced'
    );
    expect(checkClaimedTransfer(transfer, { ...ctx, lastSyncAt: undefined }).result).toBe(
      'notSynced'
    );
  });

  // ESI keeps 30 days of a wallet journal: older than that before the last sync, the book
  // could not have seen it, so "not found" would be a claim it cannot make.
  it('says too old to check, never not found, beyond what the book could have read', () => {
    expect(checkClaimedTransfer({ ...transfer, at: '2026-10-01T00:00:00.000Z' }, ctx).result).toBe(
      'tooOld'
    );
  });

  it('says too old to check for a transfer before the book started, whatever the sync window', () => {
    const early = { ...transfer, at: '2026-11-02T18:41:00.000Z' };
    expect(checkClaimedTransfer(early, { ...ctx, startDate: '2026-11-05' }).result).toBe('tooOld');
    expect(checkClaimedTransfer(early, { ...ctx, startDate: '2026-11-02' }).result).toBe(
      'notFound'
    );
  });

  describe('only a payment no one holds yet', () => {
    const open = { id: 'j1_9', characterId: 7, amount: 25_000_000, at: transfer.at };

    it('says which Miner a payment the book already placed is credited to', () => {
      const payments = [{ ...open, minerId: 'm-a' }];
      expect(checkClaimedTransfer(transfer, { ...ctx, payments })).toEqual({
        result: 'credited',
        paymentId: 'j1_9',
        minerId: 'm-a',
      });
      // One still open wins: that is the one the claim can credit.
      expect(
        checkClaimedTransfer(transfer, {
          ...ctx,
          payments: [...payments, { ...open, id: 'j1_10' }],
        })
      ).toEqual({ result: 'found', paymentId: 'j1_10' });
    });

    it('does not find a payment an officer marked wholly not tax', () => {
      expect(
        checkClaimedTransfer(transfer, {
          ...ctx,
          payments: [{ ...open, notTaxAmount: 25_000_000 }],
        }).result
      ).toBe('notFound');
      expect(
        checkClaimedTransfer(transfer, { ...ctx, payments: [{ ...open, reviewReason: 'x' }] })
          .result
      ).toBe('notFound');
      // Partly not tax: the rest is still tax.
      expect(
        checkClaimedTransfer(transfer, { ...ctx, payments: [{ ...open, notTaxAmount: 1 }] }).result
      ).toBe('found');
    });

    // The sender's own donation the sync held because their Miner seemed to owe nothing: the
    // book holds the member's money, and the proof says it was tax. Credited, not "not found".
    it("finds the sender's own donation held for review (no-open-balance)", () => {
      const held = { ...open, reviewReason: 'no-open-balance' };
      expect(checkClaimedTransfer(transfer, { ...ctx, payments: [held] })).toEqual({
        result: 'found',
        paymentId: 'j1_9',
      });
      // Still only the sender's own, and never twice.
      expect(
        checkClaimedTransfer(transfer, { ...ctx, payments: [{ ...held, characterId: 8 }] }).result
      ).toBe('notFound');
      const checks = checkClaimedTransfers([transfer, { ...transfer, journalRef: 2 }], {
        ...ctx,
        payments: [held],
      });
      expect(checks.map((c) => c.result)).toEqual(['found', 'notFound']);
      expect(
        checkClaimedTransfer(transfer, { ...ctx, payments: [held, { ...open, id: 'j1_10' }] })
          .result
      ).toBe('ambiguous');
      // Paid before the book bills from: it paid no mining the book bills, so it stays held.
      expect(
        checkClaimedTransfer(transfer, { ...ctx, payments: [held], startDate: '2026-11-03' }).result
      ).toBe('tooOld');
    });

    it('is ambiguous, never found, when several payments or rows match one transfer', () => {
      const payments = [open, { ...open, id: 'j1_10' }];
      expect(checkClaimedTransfer(transfer, { ...ctx, payments })).toEqual({
        result: 'ambiguous',
      });
      const uncounted = [{ characterId: 7, amount: 25_000_000, at: transfer.at, division: 3 }];
      expect(checkClaimedTransfer(transfer, { ...ctx, payments: [open], uncounted }).result).toBe(
        'ambiguous'
      );
    });

    it('never lets two transfers claim the same payment', () => {
      const checks = checkClaimedTransfers([transfer, { ...transfer, journalRef: 2 }], {
        ...ctx,
        payments: [open],
      });
      expect(checks.map((c) => c.result)).toEqual(['found', 'notFound']);
      expect(checks.filter((c) => c.paymentId === 'j1_9')).toHaveLength(1);
    });
  });

  it('names a transfer paid to a person or another corporation, without searching', () => {
    expect(checkClaimedTransfer({ ...transfer, recipient: 'character' }, ctx).result).toBe(
      'person'
    );
    expect(checkClaimedTransfer({ ...transfer, recipient: 'otherCorporation' }, ctx).result).toBe(
      'otherCorp'
    );
  });
});

describe('parseDeclareOwnInput transfers', () => {
  it('reads up to 10 transfers with who received them', () => {
    const t = {
      amount: 25_000_000,
      at: '2026-11-02T18:41:00.000Z',
      journalRef: 7,
      recipient: 'character',
      recipientId: 2119,
    };
    expect(
      parseDeclareOwnInput({ corporationId: 9, statementId: 's1', transfers: [t] })
    ).toMatchObject({ transfers: [t] });
    expect(() =>
      parseDeclareOwnInput({ corporationId: 9, statementId: 's1', transfers: Array(11).fill(t) })
    ).toThrow();
    expect(() =>
      parseDeclareOwnInput({
        corporationId: 9,
        statementId: 's1',
        transfers: [{ ...t, recipient: 'someone' }],
      })
    ).toThrow();
  });
});

describe('Late notices and checkpoints (decision 20261120-235011)', () => {
  const line = {
    kind: 'mined',
    date: '2026-11-01',
    key: '9001:1000:2026-11-01',
    characterId: 9001,
    structureId: 1000,
    oreLines: [{ typeId: 46280, quantity: 100 }],
    unitPrices: { 46280: 1000 },
    priceSources: { 46280: 'hub' },
    estimatedValue: 100_000,
    taxPct: 10,
    rateEffectiveFrom: '2026-10-01',
    tax: 10_000,
  };
  const notice = {
    id: 'notice_solo:9001_2026-11-18',
    minerId: 'solo:9001',
    characterIds: [9001],
    kind: 'late',
    issuedAt: '2026-11-18T09:00:00Z',
    code: paymentCode('notice_solo:9001_2026-11-18'),
    pricing: { hubId: 'jita', oreForm: 'compressed' },
    uids: ['char:1'],
    lines: [
      line,
      {
        kind: 'correction',
        date: '2026-11-03',
        key: 'adjustment:a1',
        oreLines: [],
        estimatedValue: 0,
        reason: 'fix',
        tax: 5,
      },
    ],
    listed: 1,
    mail: { sent: 4, manualSent: 2, remindersStopped: true },
    names: { minerName: 'Ore Pilot', refineryNames: { '1000': 'Athanor X' } },
  };

  it('parses a Late notice: what it listed is summed here, never taken on the client’s word', () => {
    const parsed = parseLateNotice(notice);
    expect(parsed).toMatchObject({
      id: notice.id,
      minerId: 'solo:9001',
      characterIds: [9001],
      kind: 'late',
      issuedAt: '2026-11-18T09:00:00.000Z',
      code: paymentCode(notice.id),
      pricing: { hubId: 'jita', oreForm: 'compressed' },
      listed: 10_005,
      names: { minerName: 'Ore Pilot', refineryNames: { '1000': 'Athanor X' } },
    });
    expect(parsed.lines[0]).toEqual({ ...line, unitPrices: { 46280: 1000 } });
    expect(parsed.lines[1]).toMatchObject({
      kind: 'correction',
      key: 'adjustment:a1',
      reason: 'fix',
    });
  });

  it('starts a notice unmailed, read by no one until the server names its readers', () => {
    const parsed = parseLateNotice(notice);
    expect(parsed.mail).toEqual({ sent: 0, manualSent: 0, remindersStopped: false });
    expect(parsed.uids).toEqual([]);
    expect(parsed.issuedBy).toBeUndefined();
  });

  it('prints no pricing or names it cannot name', () => {
    const parsed = parseLateNotice({
      ...notice,
      pricing: undefined,
      names: undefined,
    });
    expect(parsed).not.toHaveProperty('pricing');
    expect(parsed).not.toHaveProperty('names');
  });

  it('refuses a malformed notice', () => {
    expect(() => parseLateNotice({ ...notice, id: 'a/b' })).toThrow();
    expect(() => parseLateNotice({ ...notice, kind: 'statement' })).toThrow();
    expect(() => parseLateNotice({ ...notice, lines: [{ ...line, date: 'soon' }] })).toThrow();
    expect(() => parseLateNotice({ ...notice, lines: [{ ...line, kind: 'other' }] })).toThrow();
    expect(() => parseLateNotice({ ...notice, pricing: { hubId: 'x', oreForm: 'raw' } })).toThrow();
    expect(() => parseLateNotice({ ...notice, names: { minerName: 5 } })).toThrow();
  });

  it('never issues a final notice: only closing the account sends one', () => {
    expect(() => parseLateNotice({ ...notice, kind: 'final' })).toThrow();
    expect(() =>
      parseLateNotice({ ...notice, kind: 'final', id: finalNoticeId('solo:9001') })
    ).toThrow();
    expect(() => parseLateNotice({ ...notice, id: finalNoticeId('solo:9001') })).toThrow();
    expect(() => parseLateNotice({ ...notice, id: 'final_other' })).toThrow();
  });

  it('prints the code its id hashes to, and refuses any other', () => {
    const own = paymentCode(notice.id);
    expect(parseLateNotice({ ...notice, code: own }).code).toBe(own);
    expect(parseLateNotice({ ...notice, code: undefined }).code).toBe(own);
    expect(() => parseLateNotice({ ...notice, code: 'MT00AB12' })).toThrow();
  });

  it('issues a Late notice through the edit union', () => {
    const action = parseEditAction({ action: 'issueLateNotice', notice });
    expect(action).toMatchObject({ action: 'issueLateNotice', notice: { id: notice.id } });
    const huge = {
      ...notice,
      lines: Array.from({ length: 4000 }, () => ({ ...line, reason: 'x'.repeat(400) })),
    };
    expect(() => parseEditAction({ action: 'issueLateNotice', notice: huge })).toThrow();
  });

  it('records a Late notice’s mail, as recordMail does', () => {
    expect(
      parseEditAction({ action: 'recordLateNoticeMail', noticeId: 'n1', mailId: 7, kind: 'notice' })
    ).toEqual({ action: 'recordLateNoticeMail', noticeId: 'n1', mailId: 7, kind: 'notice' });
    expect(
      parseEditAction({
        action: 'recordLateNoticeMail',
        noticeId: 'n1',
        mailId: 7,
        kind: 'reminder',
      })
    ).toMatchObject({ kind: 'reminder' });
    expect(() =>
      parseEditAction({
        action: 'recordLateNoticeMail',
        noticeId: 'n/1',
        mailId: 7,
        kind: 'notice',
      })
    ).toThrow();
  });

  it('takes a noticeId where a Statement id was named, and the old name still', () => {
    for (const key of ['noticeId', 'statementId'])
      expect(parseEditAction({ action: 'declare', [key]: 'n1', kind: 'contract' })).toMatchObject({
        action: 'declare',
        noticeId: 'n1',
      });
    for (const key of ['noticeId', 'statementId'])
      expect(parseEditAction({ action: 'recordReminder', [key]: 'n1' })).toEqual({
        action: 'recordReminder',
        noticeId: 'n1',
      });
    expect(parseDeclareOwnInput({ corporationId: 1, noticeId: 'n1' })).toMatchObject({
      noticeId: 'n1',
    });
    expect(parseDeclareOwnInput({ corporationId: 1, statementId: 'n1' })).toMatchObject({
      noticeId: 'n1',
    });
    expect(() => parseEditAction({ action: 'declare', kind: 'contract' })).toThrow();
  });

  it('a write-off pins nothing: an old client naming a Statement is told to reload', () => {
    expect(
      parseEditAction({ action: 'writeOff', minerId: 'm1', amount: 5, reason: 'left' })
    ).toEqual({ action: 'writeOff', minerId: 'm1', amount: 5, reason: 'left' });
    let caught: unknown;
    try {
      parseEditAction({
        action: 'writeOff',
        minerId: 'm1',
        statementId: 's1',
        amount: 5,
        reason: 'l',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: 'failed-precondition', details: { reason: 'reload' } });
  });

  it('records an account’s credit when the tab sends it', () => {
    const base = { minerId: 'm1', owed: 0, paid: 0, days: 0 };
    expect(
      parseEditAction({ action: 'recordAccounts', accounts: [{ ...base, credit: 25 }] })
    ).toMatchObject({ accounts: [{ credit: 25 }] });
    expect(() =>
      parseEditAction({ action: 'recordAccounts', accounts: [{ ...base, credit: -1 }] })
    ).toThrow();
  });

  it('resets a Miner’s checkpoint', () => {
    expect(parseEditAction({ action: 'resetCheckpoint', minerId: 'solo:5' })).toEqual({
      action: 'resetCheckpoint',
      minerId: 'solo:5',
    });
    expect(needsLiveCheck(parseEditAction({ action: 'resetCheckpoint', minerId: 'solo:5' }))).toBe(
      true
    );
  });

  describe('recordCheckpoints', () => {
    const checkpoint = {
      minerId: 'solo:9001',
      through: '2026-09-30',
      owed: [{ date: '2026-09-02', remaining: 50, charge: 10 }],
      credit: 0,
      balance: 50,
      paidThrough: '2026-09-01',
      at: '2026-11-18T09:00:00Z',
      by: 1,
    };

    it('parses each checkpoint; who recorded it and when are the server’s', () => {
      const action = parseEditAction({ action: 'recordCheckpoints', checkpoints: [checkpoint] });
      expect(action).toEqual({
        action: 'recordCheckpoints',
        checkpoints: [
          {
            minerId: 'solo:9001',
            through: '2026-09-30',
            owed: [{ date: '2026-09-02', remaining: 50, charge: 10 }],
            credit: 0,
            balance: 50,
            paidThrough: '2026-09-01',
          },
        ],
      });
      expect(
        parseEditAction({
          action: 'recordCheckpoints',
          checkpoints: [{ ...checkpoint, paidThrough: null, owed: [] }],
        })
      ).toMatchObject({ checkpoints: [{ paidThrough: null, owed: [] }] });
    });

    it('refuses a malformed checkpoint', () => {
      const bad = (patch: object) =>
        parseEditAction({
          action: 'recordCheckpoints',
          checkpoints: [{ ...checkpoint, ...patch }],
        });
      expect(() => bad({ through: '2026-9-30' })).toThrow();
      expect(() => bad({ credit: -1 })).toThrow();
      expect(() => bad({ owed: [{ date: 'x', remaining: 1 }] })).toThrow();
      expect(() => bad({ paidThrough: 5 })).toThrow();
      expect(() => bad({ minerId: 'a/b' })).toThrow();
    });
  });
});

describe('checkpointRefusal: a checkpoint is a cache, stored only when it can be trusted', () => {
  const k = {
    minerId: 'solo:5',
    through: '2026-08-31',
    owed: [{ date: '2026-08-20', remaining: 100 }],
    credit: 0,
    balance: 100,
    paidThrough: '2026-08-19',
  };
  const ctx = { today: '2026-10-18', known: true, isDirector: false };
  const live = {
    unpaidDays: [
      { date: '2026-08-20', owed: 100 },
      { date: '2026-09-02', owed: 70 },
    ],
  };

  it('stores one that moves forward, adds up and owes what the account says', () => {
    expect(checkpointRefusal(k, ctx)).toBeNull();
    expect(checkpointRefusal(k, { ...ctx, live })).toBeNull();
  });

  it('refuses one that does not move forward, does not add up, or names no Miner', () => {
    expect(checkpointRefusal(k, { ...ctx, stored: { through: '2026-08-31' } })).toBe('not-forward');
    expect(checkpointRefusal({ ...k, balance: 5 }, ctx)).toBe('balance');
    expect(checkpointRefusal(k, { ...ctx, known: false })).toBe('unknown-miner');
  });

  it('owing less than the recorded account through that day needs a Director', () => {
    const less = { ...k, owed: [], balance: 0, paidThrough: '2026-08-31' };
    expect(checkpointRefusal(less, { ...ctx, live })).toBe('director-approval');
    expect(checkpointRefusal(less, { ...ctx, live, isDirector: true })).toBeNull();
    // Days after `through` are not the checkpoint's to owe.
    expect(
      checkpointRefusal(k, { ...ctx, live: { unpaidDays: [{ date: '2026-09-02', owed: 70 }] } })
    ).toBeNull();
  });
});

describe('handRecordMatch: the same ISK is never counted twice', () => {
  const stated = { characterId: 7, amount: 5_000_000, at: '2026-11-02T00:00:00.000Z' };
  const held = [{ id: 'j1_1', characterId: 7, amount: 5_000_000, at: '2026-11-01T03:00:00.000Z' }];
  const uncounted = [
    { id: 'j3_9', characterId: 7, amount: 5_000_000.5, at: '2026-11-02T06:00:00.000Z' },
  ];

  it('finds a donation the book holds, or one noted in an unread division, nearest first', () => {
    expect(handRecordMatch(stated, { held, uncounted })).toEqual({ kind: 'uncounted', id: 'j3_9' });
    expect(handRecordMatch(stated, { held, uncounted: [] })).toEqual({ kind: 'held', id: 'j1_1' });
  });

  it('is nothing for another sender, another amount, or a transfer days away', () => {
    expect(handRecordMatch({ ...stated, characterId: 8 }, { held, uncounted })).toBeNull();
    expect(handRecordMatch({ ...stated, amount: 4_000_000 }, { held, uncounted })).toBeNull();
    expect(
      handRecordMatch({ ...stated, at: '2026-11-08T00:00:00.000Z' }, { held, uncounted })
    ).toBeNull();
  });
});

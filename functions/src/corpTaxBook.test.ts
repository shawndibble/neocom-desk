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
  needsLiveCheck,
  parseEditAction,
  parseSettingsPatch,
  sameDivisions,
  parseStatement,
  parseSyncInput,
  donationsReadAtPatch,
  parseToken,
  parseTurnOnInput,
  reanchorCadence,
  satisfies,
  startDateMoveReason,
} from './corpTaxBook.js';

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
    expect(() => parseClaimPaymentInput({ corporationId: 9, paymentId: '../x' })).toThrow();
    expect(() => parseClaimPaymentInput({ corporationId: 0, paymentId: 'a' })).toThrow();
  });

  it('parses a Miner declaring their own Statement paid: amount and note optional (#6206)', () => {
    expect(parseDeclareOwnInput({ corporationId: 9, statementId: 's1' })).toEqual({
      corporationId: 9,
      statementId: 's1',
    });
    expect(
      parseDeclareOwnInput({
        corporationId: 9,
        statementId: 's1',
        amount: 1500000,
        note: ' sent by contract ',
      })
    ).toEqual({ corporationId: 9, statementId: 's1', amount: 1500000, note: 'sent by contract' });
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

  describe('billedDisputeTax: a waived dispute priced from the book’s issued Statements', () => {
    const disputed = {
      lines: [
        { recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 100, payeeName: 'A' },
        { recordKey: '77:1000:2026-11-01', typeId: 45491, quantity: 50, payeeName: 'A' },
      ],
    };
    const mined = (chargeKey: string, typeId: number, quantity: number, taxPct = 10) => ({
      kind: 'mined',
      date: '2026-11-01',
      chargeKey,
      oreLines: [{ typeId, quantity }],
      unitPrices: { [typeId]: typeId === 45490 ? 1000 : 2000 },
      taxPct,
    });

    it('prices the disputed ore at the prices and rate its Statement billed', () => {
      const statements = [
        { lines: [mined('60:1000:2026-11-01', 45490, 100)] },
        { lines: [mined('77:1000:2026-11-01', 45491, 50, 20)] },
      ];
      // 100 × 1000 × 10% + 50 × 2000 × 20%
      expect(billedDisputeTax(disputed, statements)).toBe(30_000);
    });

    it('caps the disputed ore at what the Statements billed, late ore included', () => {
      const late = { ...mined('60:1000:2026-11-01', 45490, 30), kind: 'late-ore' };
      const statements = [
        { lines: [mined('60:1000:2026-11-01', 45490, 40), late] },
        { lines: [mined('77:1000:2026-11-01', 45491, 50)] },
      ];
      expect(billedDisputeTax(disputed, statements)).toBe(70 * 100 + 50 * 200);
    });

    it('cannot price a disputed record no Statement billed yet', () => {
      expect(
        billedDisputeTax(disputed, [{ lines: [mined('60:1000:2026-11-01', 45490, 100)] }])
      ).toBeUndefined();
      expect(billedDisputeTax(disputed, [])).toBeUndefined();
    });

    it('ignores correction lines and malformed lines', () => {
      const statements = [
        {
          lines: [
            { kind: 'correction', date: '2026-11-01', adjustmentId: 'a1', tax: -5 },
            { kind: 'mined', chargeKey: '77:1000:2026-11-01' },
            mined('60:1000:2026-11-01', 45490, 100),
          ],
        },
      ];
      expect(billedDisputeTax(disputed, statements)).toBeUndefined();
    });
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

import { describe, expect, it } from 'vitest';
import {
  ACCESS_TTL_MS,
  ROLE_CACHE_MS,
  decideRoles,
  dismissalNeedsDirector,
  defaultSettings,
  isCacheFresh,
  moveStartRate,
  parseClaimPaymentInput,
  needsLiveCheck,
  parseEditAction,
  parseSettingsPatch,
  parseStatement,
  parseSyncInput,
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
      graceHours: 6,
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

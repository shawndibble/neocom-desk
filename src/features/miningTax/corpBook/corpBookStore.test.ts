import { describe, expect, it } from 'vitest';
import { readBilledByPointer, refineryNamesOf } from './corpBookStore';
import {
  readAdjustment,
  readBookSettings,
  readDismissal,
  readFeederCoverage,
  readMemberDeclaration,
  readMiner,
  readPayment,
  readToleranceExemption,
  readWriteOff,
} from '@/engine/corpTaxBook/docShapes';

describe('readBookSettings', () => {
  const book = {
    active: true,
    startDate: '2026-10-01',
    graceHours: 12,
    hubId: 'amarr',
    oreForm: 'raw',
    divisions: [2],
    rates: [
      { scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' },
      { scope: 'nonsense', pct: 5 },
      'junk',
    ],
    lastSync: { at: Date.parse('2026-10-18T12:00:00Z'), byName: 'Officer' },
  };

  it('reads an active book with its dated rates and last sync', () => {
    expect(readBookSettings(98000001, book)).toEqual({
      corporationId: 98000001,
      startDate: '2026-10-01',
      graceHours: 12,
      overdueDays: 14,
      hubId: 'amarr',
      oreForm: 'raw',
      divisions: [2],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
      lastSyncedAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it("reads the book's per-day tolerance only when the corp changed it", () => {
    expect(readBookSettings(1, book)).not.toHaveProperty('dayTolerancePct');
    expect(readBookSettings(1, { ...book, dayTolerancePct: 0.5 })).not.toHaveProperty(
      'dayTolerancePct'
    );
    expect(readBookSettings(1, { ...book, dayTolerancePct: 1.5 })?.dayTolerancePct).toBe(1.5);
  });

  it("reads the corp's wallet division names a Director stored (#6161), skipping garbage", () => {
    expect(
      readBookSettings(1, { ...book, divisionNames: { '2': 'MOON TAXES', '9': 'x', '3': 5 } })
        ?.divisionNames
    ).toEqual({ 2: 'MOON TAXES' });
    expect(readBookSettings(1, { ...book, divisionNames: 'junk' })).not.toHaveProperty(
      'divisionNames'
    );
  });

  it("surfaces who answers members' tax questions, absent when unset or malformed", () => {
    const taxContact = { kind: 'characters', ids: [5, 6] };
    expect(readBookSettings(1, { ...book, taxContact })?.taxContact).toEqual(taxContact);
    expect(readBookSettings(1, book)).not.toHaveProperty('taxContact');
    expect(readBookSettings(1, { ...book, taxContact: { kind: 'x' } })).not.toHaveProperty(
      'taxContact'
    );
  });

  it('reads when a sync last read the wallet: null when none has, absent on an older book', () => {
    const at = Date.parse('2026-10-17T08:00:00Z');
    expect(readBookSettings(1, { ...book, donationsReadAt: at })?.donationsCheckedAt).toBe(
      '2026-10-17T08:00:00.000Z'
    );
    expect(readBookSettings(1, { ...book, donationsReadAt: null })?.donationsCheckedAt).toBeNull();
    expect(readBookSettings(1, book)).not.toHaveProperty('donationsCheckedAt');
  });

  it('is null for a missing or switched-off book (D24: then nothing changes)', () => {
    expect(readBookSettings(1, undefined)).toBeNull();
    expect(readBookSettings(1, { ...book, active: false })).toBeNull();
    expect(readBookSettings(1, { active: true })).toBeNull();
  });

  it('hides a book from members until its setup window ends', () => {
    const seeFrom = Date.parse('2026-10-21T12:00:00Z');
    const setUp = { ...book, membersSeeFrom: seeFrom };
    expect(readBookSettings(1, setUp, seeFrom - 1)).toBeNull();
    expect(readBookSettings(1, setUp, seeFrom)).not.toBeNull();
    expect(readBookSettings(1, book, 0)).not.toBeNull();
  });

  it('takes the defaults the shared parser fills in', () => {
    expect(readBookSettings(1, { active: true, startDate: '2026-10-01' })).toMatchObject({
      graceHours: 0.5,
      overdueDays: 14,
      hubId: 'jita',
      oreForm: 'compressed',
      divisions: [1],
      rates: [],
    });
  });
});

describe('readPayment', () => {
  const base = { characterId: 5, amount: 100, at: '2026-10-18T00:00:00Z', source: 'donation' };

  it("carries an officer's note on a payment recorded by hand", () => {
    const read = readPayment('m1', {
      ...base,
      source: 'manual',
      minerId: 'solo:5',
      note: 'In person',
    });
    expect(read?.payment?.note).toBe('In person');
  });

  it('credits a Miner when the payment has one', () => {
    const read = readPayment('j1_1', { ...base, minerId: 'solo:5', notTaxAmount: 10 });
    expect(read?.payment).toMatchObject({ id: 'j1_1', minerId: 'solo:5', notTaxAmount: 10 });
    expect(read?.claimable).toBeUndefined();
    expect(read?.held).toEqual({
      characterId: 5,
      amount: 100,
      at: base.at,
      notTaxAmount: 10,
      source: 'donation',
    });
  });

  it('offers an Unmatched donation for the donor to claim', () => {
    const read = readPayment('j1_2', base);
    expect(read?.payment).toBeUndefined();
    expect(read?.claimable).toEqual({ id: 'j1_2', characterId: 5, amount: 100, at: base.at });
  });

  it('does not offer a donation an officer marked entirely "not tax"', () => {
    expect(readPayment('j1_3', { ...base, notTaxAmount: 100 })?.claimable).toBeUndefined();
  });

  it('reads a donation the sync held for review as one the donor can say was tax, never as claimable', () => {
    const read = readPayment('j5_4', {
      ...base,
      division: 5,
      reason: 'Moon tax 11-01/11-02',
      reviewReason: 'no-open-balance',
    });
    expect(read?.claimable).toBeUndefined();
    expect(read?.inReview).toEqual({
      id: 'j5_4',
      characterId: 5,
      amount: 100,
      at: base.at,
      refId: 4,
      reason: 'Moon tax 11-01/11-02',
    });
    expect(
      readPayment('j5_4', { ...base, reviewReason: 'no-open-balance', notTaxAmount: 100 })?.inReview
    ).toBeUndefined();
    expect(
      readPayment('j5_4', { ...base, reviewReason: 'no-open-balance', minerId: 'solo:5' })?.inReview
    ).toBeUndefined();
  });

  it('skips what is not a payment', () => {
    expect(readPayment('x', { amount: 'a' })).toBeNull();
  });
});

describe('the other readers', () => {
  it('reads a dismissal with its reason and reversal', () => {
    expect(
      readDismissal('d1', {
        scope: 'record',
        targetId: 'a',
        at: '2026-10-18T00:00:00Z',
        by: 7,
        reason: 'Fleet op',
        reversed: { by: 8, at: '2026-10-19T00:00:00Z', reason: 'oops' },
      })
    ).toEqual({
      id: 'd1',
      scope: 'record',
      targetId: 'a',
      at: '2026-10-18T00:00:00Z',
      by: 7,
      reason: 'Fleet op',
      reversed: { by: 8, at: '2026-10-19T00:00:00Z' },
    });
    expect(readDismissal('d2', { scope: 'galaxy', targetId: 'a', at: 'x' })).toBeNull();
  });

  it('reads a Miner, and skips a malformed one', () => {
    expect(readMiner('m', { characterIds: [1, 2], mainCharacterId: 2 })).toEqual({
      id: 'm',
      characterIds: [1, 2],
      mainCharacterId: 2,
    });
    expect(readMiner('m', { characterIds: [] })).toBeNull();
  });
});

describe('readMemberDeclaration (#6206)', () => {
  it('reads a declaration with its amount and answer, and drops a malformed one', () => {
    expect(
      readMemberDeclaration('x1', {
        statementId: 's1',
        kind: 'another-way',
        at: '2026-11-01T00:00:00.000Z',
        amount: 5,
        note: 'contract',
        uids: ['char:1'],
        resolution: { kind: 'rejected', at: '2026-11-02T00:00:00.000Z', by: 9, reason: 'no' },
      })
    ).toEqual({
      id: 'x1',
      noticeId: 's1',
      kind: 'another-way',
      at: '2026-11-01T00:00:00.000Z',
      amount: 5,
      note: 'contract',
      resolution: { kind: 'rejected', at: '2026-11-02T00:00:00.000Z', reason: 'no' },
    });
    expect(readMemberDeclaration('x2', { statementId: 's1', kind: 'other', at: 'x' })).toBeNull();
    expect(readMemberDeclaration('x3', { kind: 'contract', at: 'x' })).toBeNull();
  });
});

describe('readBilledByPointer', () => {
  it('lists the corporations whose books bill the Character', () => {
    expect(readBilledByPointer({ books: { '98000001': 1, '98000002': 2 } })).toEqual([
      98000001, 98000002,
    ]);
  });

  it('reads a missing or malformed pointer as no books', () => {
    expect(readBilledByPointer(undefined)).toEqual([]);
    expect(readBilledByPointer({ books: 'x' })).toEqual([]);
    expect(readBilledByPointer({ books: { nope: 1, '-3': 1 } })).toEqual([]);
  });
});

describe('the miner-side copies (#4622)', () => {
  it("reads a moon owner's coverage and read clock as ISO", () => {
    expect(
      readFeederCoverage('98000077', {
        coveragePeriods: [{ from: '2026-10-01', to: '2026-10-09' }, { from: '2026-10-12' }],
        lastReadWellAt: Date.parse('2026-10-18T07:00:00Z'),
      })
    ).toEqual({
      corporationId: 98000077,
      coveragePeriods: [{ from: '2026-10-01', to: '2026-10-09' }, { from: '2026-10-12' }],
      lastReadWellAt: '2026-10-18T07:00:00.000Z',
    });
  });

  it('reads a copy with no read clock, and skips a malformed one', () => {
    expect(readFeederCoverage('5', { coveragePeriods: [] })).toEqual({
      corporationId: 5,
      coveragePeriods: [],
    });
    expect(readFeederCoverage('x', { coveragePeriods: [] })).toBeNull();
    expect(readFeederCoverage('5', {})).toBeNull();
  });

  it('reads an Adjustment, and skips a malformed one', () => {
    expect(
      readAdjustment('a1', {
        minerId: 'solo:1',
        date: '2026-10-17',
        amount: -5,
        reason: 'x',
        by: 2,
        at: '2026-10-18T00:00:00Z',
      })
    ).toEqual({
      id: 'a1',
      minerId: 'solo:1',
      date: '2026-10-17',
      amount: -5,
      reason: 'x',
      by: 2,
      at: '2026-10-18T00:00:00Z',
    });
    expect(readAdjustment('a2', { minerId: 'solo:1', amount: 1 })).toBeNull();
  });

  it('reads a write-off, and skips a malformed one (#4637)', () => {
    expect(
      readWriteOff('w1', {
        minerId: 'solo:1',
        amount: 5,
        reason: 'y',
        at: '2026-10-20T00:00:00Z',
        statementId: 's1',
        uids: ['char:1'],
      })
    ).toEqual({
      id: 'w1',
      minerId: 'solo:1',
      amount: 5,
      reason: 'y',
      at: '2026-10-20T00:00:00Z',
    });
    expect(readWriteOff('w2', { minerId: 'solo:1', amount: 5 })).toBeNull();
  });

  it("names refineries from the Late notices' own names, never a placeholder", () => {
    expect(
      refineryNamesOf([
        { names: { refineryNames: { '1000': 'Ikao - Moon Drill', '2000': 'Refinery 2000' } } },
        { names: { refineryNames: { '3000': 'Ikao - Second Drill' } } },
        {},
      ])
    ).toEqual({ 1000: 'Ikao - Moon Drill', 3000: 'Ikao - Second Drill' });
  });
});

describe('reversals, opening balances, exemptions and paid-through', () => {
  const adjustment = {
    minerId: 'solo:1',
    date: '2026-10-05',
    amount: 5,
    reason: 'x',
    by: 2,
    at: 't',
  };
  it('reads an Adjustment’s reversal, opening kind and replacement, and ignores a malformed stamp', () => {
    expect(
      readAdjustment('a1', {
        ...adjustment,
        reversed: { by: 2, at: '2026-10-06T00:00:00Z', reason: 'Twice' },
        kind: 'opening',
        replaces: 'a0',
      })
    ).toMatchObject({
      reversed: { by: 2, at: '2026-10-06T00:00:00Z', reason: 'Twice' },
      kind: 'opening',
      replaces: 'a0',
    });
    expect(readAdjustment('a1', { ...adjustment, reversed: {} })).not.toHaveProperty('reversed');
    expect(readAdjustment('a1', { ...adjustment, kind: 'other' })).not.toHaveProperty('kind');
  });

  it('reads a write-off’s reversal', () => {
    const base = { minerId: 'solo:1', amount: 5, at: 't', reason: 'x' };
    expect(
      readWriteOff('w1', { ...base, reversed: { by: 2, at: 'u', reason: 'Back' } })
    ).toMatchObject({ reversed: { by: 2, at: 'u', reason: 'Back' } });
    expect(readWriteOff('w1', base)).not.toHaveProperty('reversed');
  });

  it('reads a tolerance exemption, and skips a malformed one', () => {
    const doc = { minerId: 'solo:1', date: '2026-10-05', forgive: 0, reason: 'x', by: 2, at: 't' };
    expect(readToleranceExemption('x1', doc)).toMatchObject({ forgive: 0, date: '2026-10-05' });
    expect(readToleranceExemption('x1', { ...doc, forgive: -1 })).toBeNull();
    expect(readToleranceExemption('x1', { ...doc, date: undefined })).toBeNull();
  });

  it('reads a Miner’s paid-through day when present', () => {
    expect(readMiner('m1', { characterIds: [1], paidThrough: '2026-10-10' })?.paidThrough).toBe(
      '2026-10-10'
    );
    expect(readMiner('m1', { characterIds: [1] })).not.toHaveProperty('paidThrough');
  });
});

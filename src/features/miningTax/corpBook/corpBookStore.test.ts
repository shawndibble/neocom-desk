import { describe, expect, it } from 'vitest';
import {
  readBookSettings,
  readDismissal,
  readMiner,
  readObservedRow,
  readPayment,
  readStatement,
} from './corpBookStore';

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
      hubId: 'amarr',
      oreForm: 'raw',
      divisions: [2],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
      lastSyncedAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it('keeps a per-feeder rate', () => {
    const feeder = { scope: 'feeder', feederId: 7, pct: 6, effectiveFrom: '2026-10-01' };
    expect(readBookSettings(1, { ...book, rates: [feeder] })?.rates).toEqual([feeder]);
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

  it('defaults to the book defaults when a field is absent', () => {
    expect(readBookSettings(1, { active: true, startDate: '2026-10-01' })).toMatchObject({
      graceHours: 6,
      hubId: 'jita',
      oreForm: 'compressed',
      divisions: [1],
      rates: [],
    });
  });
});

describe('readPayment', () => {
  const base = { characterId: 5, amount: 100, at: '2026-10-18T00:00:00Z', source: 'donation' };

  it('credits a Miner when the payment has one', () => {
    const read = readPayment('j1_1', { ...base, minerId: 'solo:5', notTaxAmount: 10 });
    expect(read?.payment).toMatchObject({ id: 'j1_1', minerId: 'solo:5', notTaxAmount: 10 });
    expect(read?.claimable).toBeUndefined();
    expect(read?.held).toEqual({ characterId: 5, amount: 100, at: base.at, notTaxAmount: 10 });
  });

  it('offers an Unmatched donation for the donor to claim', () => {
    const read = readPayment('j1_2', base);
    expect(read?.payment).toBeUndefined();
    expect(read?.claimable).toEqual({ id: 'j1_2', characterId: 5, amount: 100, at: base.at });
  });

  it('does not offer a donation an officer marked entirely "not tax"', () => {
    expect(readPayment('j1_3', { ...base, notTaxAmount: 100 })?.claimable).toBeUndefined();
  });

  it('skips what is not a payment', () => {
    expect(readPayment('x', { amount: 'a' })).toBeNull();
  });
});

describe('the other readers', () => {
  it('reads an observed row with the system and moon an officer client sent', () => {
    expect(
      readObservedRow({
        structureId: 1,
        characterId: 2,
        recordedCorporationId: 3,
        typeId: 4,
        quantity: 5,
        date: '2026-10-17',
        cachedAt: '2026-10-18T00:00:00Z',
        solarSystemId: 30003838,
        moonId: 40000001,
      })
    ).toMatchObject({ solarSystemId: 30003838, moonId: 40000001 });
    expect(readObservedRow({ structureId: 1 })).toBeNull();
  });

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

  it('reads a Statement and a Miner, and skips malformed ones', () => {
    expect(
      readStatement('s1', {
        minerId: 'solo:5',
        amount: 10,
        issuedAt: '2026-10-18T00:00:00Z',
        lines: [],
        code: 'AB',
      })
    ).toMatchObject({ id: 's1', amount: 10, code: 'AB' });
    expect(readStatement('s2', { minerId: 'solo:5', amount: 10 })).toBeNull();
    expect(readMiner('m', { characterIds: [1, 2], mainCharacterId: 2 })).toEqual({
      id: 'm',
      characterIds: [1, 2],
      mainCharacterId: 2,
    });
    expect(readMiner('m', { characterIds: [] })).toBeNull();
  });
});

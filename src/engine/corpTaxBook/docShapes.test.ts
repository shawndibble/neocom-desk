import { describe, expect, it } from 'vitest';
import {
  readAdjustment,
  readBookSettings,
  readDismissal,
  readFeederCoverage,
  readMemberDeclaration,
  readMiner,
  readCheckpoint,
  readPayment,
  readWriteOff,
} from './docShapes';

describe('readBookSettings (a member sees only an active, set-up book)', () => {
  const base = { active: true, startDate: '2026-01-01' };
  it('is null for no doc, an inactive book or one without a start date', () => {
    expect(readBookSettings(1, undefined)).toBeNull();
    expect(readBookSettings(1, { ...base, active: false })).toBeNull();
    expect(readBookSettings(1, { active: true })).toBeNull();
  });
  it('is null until membersSeeFrom', () => {
    expect(readBookSettings(1, { ...base, membersSeeFrom: 2_000 }, 1_000)).toBeNull();
    expect(readBookSettings(1, { ...base, membersSeeFrom: 2_000 }, 2_000)?.corporationId).toBe(1);
  });
  it('turns sync stamps into ISO instants', () => {
    const out = readBookSettings(
      1,
      { ...base, lastSync: { at: 0, ok: true }, donationsReadAt: 0 },
      Date.now()
    );
    expect(out?.lastSyncedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(out?.donationsCheckedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(readBookSettings(1, { ...base, donationsReadAt: null })?.donationsCheckedAt).toBeNull();
    expect(readBookSettings(1, base)).not.toHaveProperty('donationsCheckedAt');
  });
});

describe('readPayment', () => {
  it('drops a doc without character, amount or time', () => {
    expect(readPayment('p', { amount: 1, at: 'x' })).toBeNull();
    expect(readPayment('p', { characterId: 1, amount: 1 })).toBeNull();
  });
  it('credits a matched payment to its Miner', () => {
    const out = readPayment('p', {
      characterId: 1,
      amount: 5,
      at: 't',
      minerId: 'm',
      source: 'manual',
    });
    expect(out?.payment).toMatchObject({ id: 'p', minerId: 'm', source: 'manual' });
    expect(out?.claimable).toBeUndefined();
  });
  it('makes an unmatched donation claimable, unless held for review or fully not-tax', () => {
    const d = { characterId: 1, amount: 5, at: 't', source: 'donation' };
    expect(readPayment('p', d)?.claimable).toEqual({ id: 'p', characterId: 1, amount: 5, at: 't' });
    expect(readPayment('p', { ...d, notTaxAmount: 5 })?.claimable).toBeUndefined();
    const review = readPayment('j1_77', { ...d, reviewReason: 'no-open-balance', reason: 'tax' });
    expect(review?.inReview).toEqual({
      id: 'j1_77',
      characterId: 1,
      amount: 5,
      at: 't',
      refId: 77,
      reason: 'tax',
    });
    expect(review?.claimable).toBeUndefined();
  });
});

describe('the small doc readers', () => {
  it('readDismissal needs a known scope, target and time', () => {
    expect(readDismissal('d', { scope: 'bogus', targetId: 't', at: 'a' })).toBeNull();
    expect(
      readDismissal('d', { scope: 'miner', targetId: 't', at: 'a', reversed: { by: 2 } })
    ).toEqual({
      id: 'd',
      scope: 'miner',
      targetId: 't',
      by: 0,
      at: 'a',
      reason: '',
      reversed: { by: 2, at: 'a' },
    });
  });
  it('readMemberDeclaration keeps only a confirmed or rejected resolution, and hides the officer id', () => {
    expect(readMemberDeclaration('x', { statementId: 's', kind: 'nope', at: 'a' })).toBeNull();
    const out = readMemberDeclaration('x', {
      statementId: 's',
      kind: 'contract',
      at: 'a',
      amount: 3,
      resolution: { kind: 'confirmed', at: 'b', by: 99 },
    });
    expect(out).toMatchObject({ id: 'x', amount: 3, resolution: { kind: 'confirmed', at: 'b' } });
    expect(out?.resolution).not.toHaveProperty('by');
    expect(
      readMemberDeclaration('x', {
        statementId: 's',
        kind: 'contract',
        at: 'a',
        resolution: { kind: 'confirmed', at: 'b', by: 0 },
      })?.resolution?.by
    ).toBe(0);
  });
  it('readCheckpoint reads a checkpoint that adds up, and skips one that does not', () => {
    const stored = {
      through: '2026-09-30',
      owed: [{ date: '2026-09-12', remaining: 100 }],
      credit: 0,
      balance: 100,
      paidThrough: '2026-09-11',
      at: '2026-11-02T00:00:00Z',
    };
    expect(readCheckpoint('solo:5', stored)).toMatchObject({
      minerId: 'solo:5',
      through: '2026-09-30',
    });
    expect(readCheckpoint('solo:5', { ...stored, balance: 999 })).toBeNull();
    expect(readCheckpoint('solo:5', { ...stored, owed: undefined })).toBeNull();
  });
  it('readMiner needs characters; the main defaults to the first', () => {
    expect(readMiner('m', { characterIds: [] })).toBeNull();
    expect(readMiner('m', { characterIds: [4, 'x', 5] })).toEqual({
      id: 'm',
      characterIds: [4, 5],
      mainCharacterId: 4,
    });
  });
  it('readAdjustment and readWriteOff default reason and actor', () => {
    expect(readAdjustment('a', { minerId: 'm', date: 'd' })).toBeNull();
    expect(readAdjustment('a', { minerId: 'm', date: 'd', amount: 1 })).toEqual({
      id: 'a',
      minerId: 'm',
      date: 'd',
      amount: 1,
      reason: '',
      by: 0,
      at: '',
    });
    expect(readWriteOff('w', { minerId: 'm', amount: 1 })).toBeNull();
    // A legacy write-off's notice id is not read: money names no day.
    expect(readWriteOff('w', { minerId: 'm', amount: 1, at: 't', statementId: 's' })).toEqual({
      id: 'w',
      minerId: 'm',
      amount: 1,
      at: 't',
      reason: '',
    });
  });
  it('readFeederCoverage reads the corp from the doc id and drops malformed periods', () => {
    expect(readFeederCoverage('abc', { coveragePeriods: [] })).toBeNull();
    expect(readFeederCoverage('9', {})).toBeNull();
    expect(
      readFeederCoverage('9', {
        coveragePeriods: [{ from: 'a', to: 'b' }, { to: 'c' }, null, { from: 'd' }],
        lastReadWellAt: 0,
      })
    ).toEqual({
      corporationId: 9,
      coveragePeriods: [{ from: 'a', to: 'b' }, { from: 'd' }],
      lastReadWellAt: '1970-01-01T00:00:00.000Z',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  isSettledAfterLeaving,
  isStale,
  minedRows,
  pageState,
  parseRequestedRate,
  payeeIdOf,
  payoutRows,
  rateNote,
  refineryLabeler,
} from './feederViewModel';
import type { FeederViewDay, FeederViewSummary } from './feederViewClient';

const base: FeederViewSummary = {
  schemaVersion: 1,
  feederCorporationId: 9,
  collectorCorporationId: 5,
  collectorName: 'Brass Meridian Logistics',
  status: 'active',
  mode: 'normal',
  note: null,
  builtAt: 0,
  coverageFrom: '2026-10-01',
  coverageTo: null,
  leftAt: null,
  lastReadWellAt: null,
  staleSince: null,
  effectiveRatePct: 8,
  requestedRatePct: 6,
  agreedRatePct: 8,
  rateHistory: [
    { kind: 'requested', pct: 6, effectiveFrom: '2026-10-01', recordedAt: '' },
    { kind: 'agreed', pct: 8, effectiveFrom: '2026-10-01', recordedAt: '' },
  ],
  minedVolume: 0,
  minedValueIsk: 0,
  accruedIsk: 0,
  paidIsk: 0,
  balanceKind: 'owed',
  balanceIsk: 100,
  lastPayout: null,
  refineryCount: 1,
  unpricedDays: 0,
  dismissedAt: null,
};

describe('payeeIdOf', () => {
  it('is the payee set, else the moon owner corporation (absent on an older view, or null)', () => {
    expect(payeeIdOf(base)).toBe(9);
    expect(payeeIdOf({ ...base, payee: null })).toBe(9);
    expect(payeeIdOf({ ...base, payee: { kind: 'character', id: 77 } })).toBe(77);
  });
});

describe('pageState', () => {
  it('ended wins over settled otherwise', () => {
    expect(pageState({ ...base, status: 'left', mode: 'settled-otherwise' })).toBe('ended');
    expect(pageState({ ...base, mode: 'settled-otherwise' })).toBe('settled-otherwise');
    expect(pageState(base)).toBe('normal');
    expect(pageState({ ...base, status: 'disconnected' })).toBe('normal');
  });
  it('stale only while not ended', () => {
    expect(isStale({ ...base, staleSince: 1 })).toBe(true);
    expect(isStale({ ...base, staleSince: 1, status: 'left' })).toBe(false);
    expect(isStale(base)).toBe(false);
  });
  it('after leaving folds once nothing is owed', () => {
    expect(isSettledAfterLeaving({ ...base, status: 'left' })).toBe(false);
    expect(isSettledAfterLeaving({ ...base, status: 'left', balanceKind: 'even' })).toBe(true);
    expect(isSettledAfterLeaving({ ...base, status: 'left', balanceKind: 'credit' })).toBe(true);
    expect(isSettledAfterLeaving({ ...base, balanceKind: 'even' })).toBe(false);
  });
});

describe('rateNote', () => {
  it('shows an override with the agreed date and what was asked', () => {
    expect(rateNote(base)).toEqual({
      kind: 'override',
      agreedPct: 8,
      since: '2026-10-01',
      askedPct: 6,
    });
  });
  it('is plain when agreed equals asked or only one exists', () => {
    const asked8 = [
      { kind: 'requested' as const, pct: 8, effectiveFrom: '2026-10-01', recordedAt: '' },
      { kind: 'agreed' as const, pct: 8, effectiveFrom: '2026-10-01', recordedAt: '' },
    ];
    expect(rateNote({ ...base, requestedRatePct: 8, rateHistory: asked8 })).toEqual({
      kind: 'plain',
      pct: 8,
    });
    expect(
      rateNote({
        ...base,
        agreedRatePct: null,
        effectiveRatePct: 6,
        rateHistory: [base.rateHistory[0]!],
      })
    ).toEqual({
      kind: 'plain',
      pct: 6,
    });
    expect(
      rateNote({ ...base, requestedRatePct: null, rateHistory: [base.rateHistory[1]!] })
    ).toEqual({ kind: 'plain', pct: 8 });
  });
  it('comes from the last rate change and shows what is asked for now', () => {
    const history = [
      ...base.rateHistory,
      { kind: 'requested' as const, pct: 7, effectiveFrom: '2026-10-09', recordedAt: '2' },
    ];
    expect(rateNote({ ...base, requestedRatePct: 7, rateHistory: history })).toEqual({
      kind: 'override',
      agreedPct: 8,
      since: '2026-10-01',
      askedPct: 7,
    });
  });
  it('says none when no rate is set', () => {
    expect(
      rateNote({
        ...base,
        agreedRatePct: null,
        requestedRatePct: null,
        effectiveRatePct: null,
        rateHistory: [],
      })
    ).toEqual({ kind: 'none' });
  });
});

describe('parseRequestedRate', () => {
  it('takes 0-100 with a comma or a point', () => {
    expect(parseRequestedRate('6')).toBe(6);
    expect(parseRequestedRate(' 7,5 ')).toBe(7.5);
    expect(parseRequestedRate('')).toBeNull();
    expect(parseRequestedRate('101')).toBeNull();
    expect(parseRequestedRate('-1')).toBeNull();
    expect(parseRequestedRate('abc')).toBeNull();
  });
});

describe('minedRows', () => {
  const day = (date: string, lines: FeederViewDay['lines']): FeederViewDay => ({
    date,
    billable: true,
    pct: 8,
    dueIsk: 0,
    valueIsk: 0,
    lines,
  });
  it('sums per character and refinery across days, biggest first, none dropped', () => {
    const rows = minedRows([
      day('2026-10-01', [
        { characterId: 1, structureId: 10, volume: 5, valueIsk: 100 },
        { characterId: 2, structureId: 10, volume: 1, valueIsk: 500 },
      ]),
      day('2026-10-02', [
        { characterId: 1, structureId: 10, volume: 5, valueIsk: 100 },
        { characterId: 1, structureId: 11, volume: 2, valueIsk: 50 },
      ]),
    ]);
    expect(rows.map((r) => [r.characterId, r.structureId, r.volume, r.valueIsk])).toEqual([
      [2, 10, 1, 500],
      [1, 10, 10, 200],
      [1, 11, 2, 50],
    ]);
  });
});

describe('refineryLabeler / payoutRows', () => {
  it('falls back to the id', () => {
    const label = refineryLabeler([{ structureId: 10, label: 'Efa', solarSystemId: null }]);
    expect(label(10)).toBe('Efa');
    expect(label(11)).toBe('#11');
  });
  it('orders payments newest first', () => {
    const p = (date: string) => ({
      date,
      amount: 1,
      method: 'donation' as const,
      status: 'matched' as const,
    });
    expect(payoutRows([p('2026-10-04'), p('2026-10-16')]).map((x) => x.date)).toEqual([
      '2026-10-16',
      '2026-10-04',
    ]);
  });
});

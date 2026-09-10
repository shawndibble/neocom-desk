import { describe, expect, it } from 'vitest';
import { walletBalanceHistory, walletBalanceTrend } from './balanceHistory';

describe('walletBalanceHistory', () => {
  it('returns an empty array for no entries', () => {
    expect(walletBalanceHistory([])).toEqual([]);
  });

  it('sorts entries chronologically ascending regardless of input order', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-03T00:00:00Z', balance: 300 },
      { date: '2026-01-01T00:00:00Z', balance: 100 },
      { date: '2026-01-02T00:00:00Z', balance: 200 },
    ]);
    expect(points.map((p) => p.balance)).toEqual([100, 200, 300]);
  });

  it('skips entries missing balance rather than treating them as zero', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-01T00:00:00Z', balance: 100 },
      { date: '2026-01-02T00:00:00Z' },
      { date: '2026-01-03T00:00:00Z', balance: 300 },
    ]);
    expect(points).toEqual([
      { date: '2026-01-01T00:00:00Z', balance: 100 },
      { date: '2026-01-03T00:00:00Z', balance: 300 },
    ]);
  });

  it('returns an empty array when every entry is missing balance', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-01T00:00:00Z' },
      { date: '2026-01-02T00:00:00Z' },
    ]);
    expect(points).toEqual([]);
  });
});

describe('walletBalanceTrend', () => {
  it('is flat for fewer than two points', () => {
    expect(walletBalanceTrend([])).toBe('flat');
    expect(walletBalanceTrend([{ date: '2026-01-01T00:00:00Z', balance: 100 }])).toBe('flat');
  });

  it('is up when the last point is higher than the first', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-01T00:00:00Z', balance: 100 },
      { date: '2026-01-02T00:00:00Z', balance: 200 },
    ]);
    expect(walletBalanceTrend(points)).toBe('up');
  });

  it('is down when the last point is lower than the first', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-01T00:00:00Z', balance: 200 },
      { date: '2026-01-02T00:00:00Z', balance: 100 },
    ]);
    expect(walletBalanceTrend(points)).toBe('down');
  });

  it('is flat when the first and last points are equal', () => {
    const points = walletBalanceHistory([
      { date: '2026-01-01T00:00:00Z', balance: 100 },
      { date: '2026-01-02T00:00:00Z', balance: 150 },
      { date: '2026-01-03T00:00:00Z', balance: 100 },
    ]);
    expect(walletBalanceTrend(points)).toBe('flat');
  });
});

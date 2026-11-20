import { describe, expect, it } from 'vitest';
import { datedRateReady } from './rateForm';

describe('datedRateReady', () => {
  it('accepts 0 to 100 starting up to 30 days back, today or later', () => {
    expect(datedRateReady('0', '2026-11-17', '2026-11-17')).toBe(true);
    expect(datedRateReady('7.5', '2026-12-01', '2026-11-17')).toBe(true);
    expect(datedRateReady('100', '2026-11-17', '2026-11-17')).toBe(true);
    expect(datedRateReady('0', '2026-10-18', '2026-11-17')).toBe(true);
  });
  it('refuses empty, out of range, or backdated past 30 days', () => {
    expect(datedRateReady('', '2026-11-17', '2026-11-17')).toBe(false);
    expect(datedRateReady('101', '2026-11-17', '2026-11-17')).toBe(false);
    expect(datedRateReady('-1', '2026-11-17', '2026-11-17')).toBe(false);
    expect(datedRateReady('8', '2026-10-17', '2026-11-17')).toBe(false);
    expect(datedRateReady('8', '', '2026-11-17')).toBe(false);
    expect(datedRateReady('  ', '2026-11-17', '2026-11-17')).toBe(false);
  });
});

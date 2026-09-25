import { describe, expect, it } from 'vitest';
import { MINING_TAX_WARNING_DAYS, miningTaxSeverity } from './boardSeverity';
import type { MiningTaxBoardData } from './boardData';

function data(overrides: Partial<MiningTaxBoardData> = {}): MiningTaxBoardData {
  return {
    unpaidIsk: 0,
    payeeCount: 0,
    unassignedCount: 0,
    oldestUnpaidDays: null,
    needsReauth: false,
    fetchedAt: null,
    ...overrides,
  };
}

describe('miningTaxSeverity', () => {
  it('is null until the snapshot lands', () => {
    expect(miningTaxSeverity(null)).toBeNull();
  });

  it('keeps a lapsed grant at warning', () => {
    expect(miningTaxSeverity(data({ needsReauth: true }))).toBe('warning');
  });

  it('is only watch while unpaid tax is younger than the threshold', () => {
    const fresh = data({
      unpaidIsk: 1,
      payeeCount: 1,
      oldestUnpaidDays: MINING_TAX_WARNING_DAYS - 1,
    });
    expect(miningTaxSeverity(fresh)).toBe('watch');
  });

  it('ages into warning at the threshold', () => {
    const aged = data({ unpaidIsk: 1, payeeCount: 1, oldestUnpaidDays: MINING_TAX_WARNING_DAYS });
    expect(miningTaxSeverity(aged)).toBe('warning');
    expect(MINING_TAX_WARNING_DAYS).toBe(30);
  });

  it('is watch for unassigned entries and clear when nothing is owed', () => {
    expect(miningTaxSeverity(data({ unassignedCount: 2 }))).toBe('watch');
    expect(miningTaxSeverity(data())).toBe('clear');
  });
});

import { describe, expect, it } from 'vitest';
import { scopePresentation } from './scope';

describe('scopePresentation', () => {
  it('is quiet when the widget does not ask for All characters', () => {
    expect(scopePresentation('wallet', 'header')).toEqual({
      scopeAll: false,
      chip: false,
      fallbackNote: false,
    });
  });

  it('sums and shows the chip for a kind that can sum, when its own scope is All', () => {
    expect(scopePresentation('orders', 'all')).toEqual({
      scopeAll: true,
      chip: true,
      fallbackNote: false,
    });
  });

  it('falls back to the header Character, and says so, for a kind that cannot sum', () => {
    expect(scopePresentation('mail', 'all')).toEqual({
      scopeAll: false,
      chip: false,
      fallbackNote: true,
    });
  });

  it('shows the chip, with no note, for an account-wide kind asked for All', () => {
    expect(scopePresentation('miningTax', 'all')).toEqual({
      scopeAll: true,
      chip: true,
      fallbackNote: false,
    });
  });

  it('never notes a fallback for a placeholder kind with no data', () => {
    expect(scopePresentation('netWorth', 'all').fallbackNote).toBe(false);
  });
});

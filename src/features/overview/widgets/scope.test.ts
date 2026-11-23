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

  it('narrows a kind that can sum to the one corporation, with the chip', () => {
    expect(scopePresentation('orders', 'corp:7')).toEqual({
      scopeAll: true,
      chip: true,
      fallbackNote: false,
      corporationId: 7,
    });
  });

  it('asks a kind that reads one corporation which one, on the Corp Board', () => {
    expect(scopePresentation('mail', 'all', undefined, true)).toEqual({
      scopeAll: false,
      chip: false,
      fallbackNote: false,
      needsOneCorporation: true,
    });
    expect(scopePresentation('mail', 'corp:7', undefined, true)).toMatchObject({
      needsOneCorporation: true,
      wantedCorporationId: 7,
    });
  });
});

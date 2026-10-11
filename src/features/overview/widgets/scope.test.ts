import { describe, expect, it } from 'vitest';
import { scopePresentation } from './scope';

describe('scopePresentation', () => {
  it('is quiet when neither the widget nor the header asks for All characters', () => {
    expect(scopePresentation('wallet', 'header', false)).toEqual({
      scopeAll: false,
      chip: false,
      fallbackNote: false,
    });
  });

  it('sums and shows the chip for a kind that can sum, when its own scope is All', () => {
    expect(scopePresentation('orders', 'all', false)).toEqual({
      scopeAll: true,
      chip: true,
      fallbackNote: false,
    });
  });

  it('follows the header switcher when it is on All characters', () => {
    expect(scopePresentation('orders', 'header', true)).toMatchObject({
      scopeAll: true,
      chip: true,
    });
  });

  it('falls back to the header Character, and says so, for a kind that cannot sum', () => {
    expect(scopePresentation('industry', 'all', false)).toEqual({
      scopeAll: false,
      chip: false,
      fallbackNote: true,
    });
    expect(scopePresentation('wallet', 'header', true).fallbackNote).toBe(true);
  });

  it('shows the chip, with no note, for an account-wide kind asked for All', () => {
    expect(scopePresentation('miningTax', 'header', true)).toEqual({
      scopeAll: true,
      chip: true,
      fallbackNote: false,
    });
  });

  it('never notes a fallback for a placeholder kind with no data', () => {
    expect(scopePresentation('netWorth', 'all', true).fallbackNote).toBe(false);
  });
});

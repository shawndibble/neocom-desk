import { describe, it, expect } from 'vitest';
import { formatIsk, iskToneClass, humanizeRefType } from './format';

describe('formatIsk', () => {
  it('formats with thousands separators and 2 decimals', () => {
    expect(formatIsk(1234567.891)).toBe('1,234,567.89');
  });

  it('formats negative values with a leading minus', () => {
    expect(formatIsk(-11724000)).toBe('-11,724,000.00');
  });

  it('clamps a rounding-noise negative near zero to "0.00" instead of "-0.00" (BUG #9)', () => {
    expect(formatIsk(-0.004)).toBe('0.00');
    expect(formatIsk(-0.006)).toBe('-0.01');
  });
});

describe('iskToneClass', () => {
  it('is the negative token for negative values', () => {
    expect(iskToneClass(-1)).toBe('text-isk-neg');
  });

  it('is the positive token for zero and positive values', () => {
    expect(iskToneClass(0)).toBe('text-isk-pos');
    expect(iskToneClass(1)).toBe('text-isk-pos');
  });

  it('is the positive token for a rounding-noise negative near zero (BUG #9)', () => {
    expect(iskToneClass(-0.004)).toBe('text-isk-pos');
  });
});

describe('humanizeRefType', () => {
  it('replaces underscores with spaces and capitalizes the first letter', () => {
    expect(humanizeRefType('contract_price_payment_corp')).toBe('Contract price payment corp');
  });

  it('handles a single word', () => {
    expect(humanizeRefType('bounty_prizes')).toBe('Bounty prizes');
  });

  it('leaves an already-single lowercase word capitalized', () => {
    expect(humanizeRefType('undocked')).toBe('Undocked');
  });
});

import { describe, it, expect } from 'vitest';
import { iskToneClass, humanizeRefType } from './format';

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

  it('is still the negative token just past the clamp threshold (pins the 2-decimal epsilon)', () => {
    expect(iskToneClass(-0.006)).toBe('text-isk-neg');
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

import { describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { basisSummary, valueButtonLabel } from './basisLabel';

describe('valueButtonLabel', () => {
  it('is just the basis at the default 100% rate', () => {
    expect(valueButtonLabel(i18n.t, 'buy', 100)).toBe('Jita buy');
  });

  it('prefixes the rate below 100%', () => {
    expect(valueButtonLabel(i18n.t, 'buy', 90)).toBe('90% · Jita buy');
  });
});

describe('basisSummary', () => {
  it('reads unchanged at 100% on a mined-day basis', () => {
    expect(basisSummary(i18n.t, 'sell', 100)).toBe('Valued at Jita sell on the day mined.');
  });

  it('folds the rate in below 100% on a mined-day basis', () => {
    expect(basisSummary(i18n.t, 'sell', 90)).toBe('Valued at 90% of Jita sell on the day mined.');
  });

  it('reads unchanged at 100% on a now basis', () => {
    expect(basisSummary(i18n.t, 'now-buy', 100)).toBe(
      "Valued at today's live Jita buy price for every day."
    );
  });

  it('folds the rate in below 100% on a now basis', () => {
    expect(basisSummary(i18n.t, 'now-buy', 0)).toBe(
      "Valued at 0% of today's live Jita buy price for every day."
    );
  });
});

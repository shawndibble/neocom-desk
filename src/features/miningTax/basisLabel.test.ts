import { describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { basisSummary, basisUsage, valueButtonLabel } from './basisLabel';

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

describe('basisUsage', () => {
  const counts = { total: 6, saved: 6, average: 0, live: 0, none: 0 };

  it('counts saved days when nothing fell back', () => {
    expect(basisUsage(i18n.t, 'buy', counts)).toBe('6 of 6 days use saved prices');
  });

  it('singular for one day', () => {
    expect(basisUsage(i18n.t, 'buy', { ...counts, total: 1, saved: 1 })).toBe(
      '1 of 1 day uses saved prices'
    );
  });

  it('names each fallback source', () => {
    expect(basisUsage(i18n.t, 'sell', { total: 8, saved: 4, average: 2, live: 1, none: 1 })).toBe(
      '4 of 8 days use saved prices, 2 daily avg, 1 live, 1 unpriced'
    );
  });

  it('is empty under a now basis or with no days', () => {
    expect(basisUsage(i18n.t, 'now-buy', counts)).toBe('');
    expect(basisUsage(i18n.t, 'buy', { ...counts, total: 0, saved: 0 })).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import type { AbyssalEstimate } from '@/market/mutamarket';
import { abyssalValueHint } from './abyssalValueHint';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-16T12:00:00Z');
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}(${String(opts.age ?? opts.count)})` : key;

function priced(over: Partial<AbyssalEstimate> = {}): AbyssalEstimate {
  return {
    status: 'priced',
    value: 100,
    source: 'mutamarket',
    fetchedAt: NOW - 1000,
    valueUpdatedAt: null,
    url: 'https://mutamarket.com',
    ...over,
  };
}

describe('abyssalValueHint', () => {
  it('says how old a priced estimate is, by MutaMarket model run', () => {
    const hint = abyssalValueHint(
      priced({ valueUpdatedAt: new Date(NOW - 3 * DAY).toISOString() }),
      t,
      NOW
    );
    expect(hint).toContain('market.mutamarket.estimateNote');
    expect(hint).toContain('assets.abyssal.rowEstimatedAge(common.age.days(3))');
  });

  it('falls back to when this device fetched it', () => {
    const hint = abyssalValueHint(priced({ valueUpdatedAt: 'garbage' }), t, NOW);
    expect(hint).toContain('assets.abyssal.rowEstimatedAge(common.age.justNow)');
  });

  it('says why there is no estimate, and nothing while the lookup is out', () => {
    expect(abyssalValueHint(priced({ status: 'unavailable', value: null }), t, NOW)).toBe(
      'market.itemDetail.abyssal.estimate.unavailable'
    );
    expect(abyssalValueHint(undefined, t, NOW)).toBeUndefined();
  });
});

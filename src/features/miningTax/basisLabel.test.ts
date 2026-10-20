import { describe, expect, it } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { basisPriceHint, basisSummary, valueButtonLabel } from './basisLabel';

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

describe('basisPriceHint', () => {
  const TODAY = '2026-09-20';

  it('says today or yesterday may be live until the day is published', () => {
    expect(basisPriceHint(i18n.t, 'buy', 100, '2026-09-19', TODAY)).toBe(
      "Jita buy on 2026-09-19, not today's price. Raw ore is priced as its compressed form. Until that day's closing price is published, it uses today's live price."
    );
    expect(basisPriceHint(i18n.t, 'now-buy', 100, TODAY, TODAY)).not.toContain('Until');
  });

  it('names the chosen side on the day mined', () => {
    expect(basisPriceHint(i18n.t, 'sell', 100, '2026-09-08', TODAY)).toBe(
      "Jita sell on 2026-09-08, not today's price. Raw ore is priced as its compressed form."
    );
  });

  it('folds the rate in below 100%', () => {
    expect(basisPriceHint(i18n.t, 'buy', 90, '2026-09-08', TODAY)).toBe(
      "90% of Jita buy on 2026-09-08, not today's price. Raw ore is priced as its compressed form."
    );
  });

  it("says a now basis uses today's live price, not the mined day's", () => {
    expect(basisPriceHint(i18n.t, 'now-buy', 100, '2026-09-08', TODAY)).toBe(
      "Today's live Jita buy price, not the price on 2026-09-08. Raw ore is priced as its compressed form."
    );
    expect(basisPriceHint(i18n.t, 'now-sell', 90, '2026-09-08', TODAY)).toBe(
      "90% of today's live Jita sell price, not the price on 2026-09-08. Raw ore is priced as its compressed form."
    );
  });
});

import type { TFunction } from 'i18next';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';
import { shiftDate } from '@/engine/miningTax/yieldRange';

/** "Jita buy", "Jita sell", "Now · Jita buy" — the basis as the Value button and summary name it. */
export function basisLabel(t: TFunction, basis: PriceBasis): string {
  const side = t(`miningTax.overview.basis.${basisSide(basis)}`);
  return isNowBasis(basis) ? t('miningTax.overview.basis.nowOf', { side }) : side;
}

/**
 * The Value button's full label (issue #1280): "Jita buy" at the default
 * 100% buyback rate, "90% · Jita buy" below it — a rate at 100 is off, so it
 * stays silent rather than reading "100% · Jita buy" everywhere.
 */
export function valueButtonLabel(t: TFunction, basis: PriceBasis, buybackRate: number): string {
  const basisPart = basisLabel(t, basis);
  return buybackRate < 100
    ? t('miningTax.overview.basis.rateOf', { percent: buybackRate, price: basisPart })
    : basisPart;
}

/** The page summary line, with the buyback rate folded in below 100%. */
export function basisSummary(t: TFunction, basis: PriceBasis, buybackRate: number): string {
  const rated = buybackRate < 100;
  if (isNowBasis(basis)) {
    const price = t(`miningTax.overview.basis.${basisSide(basis)}`);
    return rated
      ? t('miningTax.overview.basis.summaryNowRated', { percent: buybackRate, price })
      : t('miningTax.overview.basis.summaryNow', { price });
  }
  const price = basisLabel(t, basis);
  return rated
    ? t('miningTax.overview.basis.summaryDayRated', { percent: buybackRate, price })
    : t('miningTax.overview.basis.summaryDay', { price });
}

/**
 * The row detail's "How this is priced" line: the chosen side and buyback
 * rate, and whether that is the mined day's price or today's. A mined day of
 * today or yesterday may not be published yet, so it says it may be live.
 */
export function basisPriceHint(
  t: TFunction,
  basis: PriceBasis,
  buybackRate: number,
  date: string,
  today: string
): string {
  const price = t(`miningTax.overview.basis.${basisSide(basis)}`);
  const percent = buybackRate;
  const rated = buybackRate < 100;
  if (isNowBasis(basis)) {
    return rated
      ? t('miningTax.overview.detail.priceBasisNowRatedHint', { percent, price, date })
      : t('miningTax.overview.detail.priceBasisNowHint', { price, date });
  }
  const hint = rated
    ? t('miningTax.overview.detail.priceBasisDayRatedHint', { percent, price, date })
    : t('miningTax.overview.detail.priceBasisDayHint', { price, date });
  return date >= shiftDate(today, -1)
    ? `${hint} ${t('miningTax.overview.detail.priceBasisUnpublishedHint')}`
    : hint;
}

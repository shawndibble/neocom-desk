import type { TFunction } from 'i18next';
import {
  basisSide,
  isNowBasis,
  type DaysBySource,
  type PriceBasis,
} from '@/engine/miningTax/priceBasis';

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
 * How many shown days actually priced on each source (issue #1760): "4 of 6
 * days use saved prices, 1 daily avg, 1 live". Empty under a now basis, where
 * every day is live by definition, and when no day is shown.
 */
export function basisUsage(t: TFunction, basis: PriceBasis, counts: DaysBySource): string {
  if (isNowBasis(basis) || counts.total === 0) return '';
  const parts = [
    t('miningTax.overview.basis.usageSaved', { count: counts.saved, total: counts.total }),
  ];
  if (counts.historical > 0) {
    parts.push(t('miningTax.overview.basis.usageHistorical', { count: counts.historical }));
  }
  if (counts.average > 0) {
    parts.push(t('miningTax.overview.basis.usageAverage', { count: counts.average }));
  }
  if (counts.live > 0) parts.push(t('miningTax.overview.basis.usageLive', { count: counts.live }));
  if (counts.none > 0) parts.push(t('miningTax.overview.basis.usageNone', { count: counts.none }));
  return parts.join(', ');
}

import type { TFunction } from 'i18next';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';
import { shiftDate } from '@/engine/miningTax/yieldRange';

export function basisLabel(t: TFunction, basis: PriceBasis): string {
  const side = t(`miningTax.overview.basis.${basisSide(basis)}`);
  return isNowBasis(basis) ? t('miningTax.overview.basis.nowOf', { side }) : side;
}

export function valueButtonLabel(t: TFunction, basis: PriceBasis, buybackRate: number): string {
  const basisPart = basisLabel(t, basis);
  return buybackRate < 100
    ? t('miningTax.overview.basis.rateOf', { percent: buybackRate, price: basisPart })
    : basisPart;
}

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

import type { TFunction } from 'i18next';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';

/** "Jita buy", "Jita sell", "Now · Jita buy" — the basis as the Value button and summary name it. */
export function basisLabel(t: TFunction, basis: PriceBasis): string {
  const side = t(`miningTax.overview.basis.${basisSide(basis)}`);
  return isNowBasis(basis) ? t('miningTax.overview.basis.nowOf', { side }) : side;
}

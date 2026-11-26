import type { TFunction } from 'i18next';
import type { ArchiveOffer, RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { shortDate } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

export function refineryMeta(t: TFunction, row: RefineryRow, moonName: string | undefined): string {
  return [
    ...(moonName ? [moonName] : []),
    t(k('extractionCount'), { count: row.extractionCount }),
    row.lastMinedOn ? t(k('lastMined'), { date: shortDate(row.lastMinedOn) }) : t(k('neverMined')),
  ].join(' · ');
}

export const offerLabel = (t: TFunction, offer: ArchiveOffer): string =>
  offer.kind === 'gone' ? t(k('offerGone')) : t(k('offerIdle'), { count: offer.days });

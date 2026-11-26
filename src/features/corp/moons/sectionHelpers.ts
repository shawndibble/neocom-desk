import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import type { BookContextValue } from './bookContextValue';

export const tapTargetClassName = cx('inline-flex items-center', tappableRowClassName);

const CARDS_BELOW_REM = 56;

export function useCards(
  cardsBelowRem: number = CARDS_BELOW_REM
): [ref: (element: HTMLDivElement | null) => void, cards: boolean, compact: boolean] {
  const phone = useIsPhone();
  const [ref, [narrow, compact]] = useElementNarrowerThan<HTMLDivElement>([
    cardsBelowRem,
    CARDS_BELOW_REM,
  ]);
  return [ref, phone || narrow, phone || (compact && !narrow)];
}

export function moonLabel(
  names: Pick<BookContextValue['names'], 'moon' | 'refinery'>,
  place: { moonId?: number; structureId: number }
): string {
  return place.moonId === undefined ? names.refinery(place.structureId) : names.moon(place.moonId);
}

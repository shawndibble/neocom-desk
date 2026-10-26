import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import type { BookContextValue } from './bookContextValue';

/** Layout for a link or text button standing alone in a row or card: a 36px hit area on touch. */
export const tapTargetClassName = cx('inline-flex items-center', tappableRowClassName);

/** Below this width (rem) a section's table shows as cards: its columns no longer fit side by side. */
const CARDS_BELOW_REM = 56;

/** Whether a table in the element behind `ref` shows as cards: a phone, or a container too narrow for its columns. */
export function useCards(): [ref: (element: HTMLDivElement | null) => void, cards: boolean] {
  const phone = useIsPhone();
  const [ref, [narrow]] = useElementNarrowerThan<HTMLDivElement>([CARDS_BELOW_REM]);
  return [ref, phone || narrow];
}

/** A moon's name, or its refinery's while the moon is unknown: what a row calls the place. */
export function moonLabel(
  names: Pick<BookContextValue['names'], 'moon' | 'refinery'>,
  place: { moonId?: number; structureId: number }
): string {
  return place.moonId === undefined ? names.refinery(place.structureId) : names.moon(place.moonId);
}

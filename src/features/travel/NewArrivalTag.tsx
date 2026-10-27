import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';

/** Quiet text cue for a pilot who was not in the previous Local paste; the word carries it, colour only stresses it. */
export function NewArrivalTag({ threat }: { threat: ThreatLevel | 'pending' | null }) {
  const { t } = useTranslation();
  const loud = threat === 'dangerous' || threat === 'active';
  return (
    <span
      className={cx(
        'text-[0.6875rem] whitespace-nowrap',
        loud ? 'font-medium text-warning' : 'text-text-dim'
      )}
    >
      {t('travel.pilot.list.newTag')}
    </span>
  );
}

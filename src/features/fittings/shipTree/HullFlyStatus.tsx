import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import { FlyDot } from './FlyDot';
import { flyLabel } from './flyLabel';
import { MasteryBadge } from './IsisTile';

/**
 * A hull's can-fly line and mastery line for the active Character, as the
 * Ship Tree reads them: Ship Info's header and the New fitting hull pane.
 * Two siblings, so the host lays them out (stacked or in a row).
 */
export function HullFlyStatus({ status }: { status: ShipTreeHullStatus | undefined }) {
  const { t } = useTranslation();
  const mastery = status?.mastery ?? 0;
  return (
    <>
      <div className="flex items-center gap-2">
        <FlyDot status={status} />
        <span>{flyLabel(t, status)}</span>
      </div>
      <div className="flex items-center gap-2 text-text-dim">
        <MasteryBadge
          mastery={mastery}
          className={cx(
            'inline-flex items-center gap-px',
            mastery >= 5 ? 'text-mastery-elite' : 'text-text-dim'
          )}
          ringClassName="flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[0.625rem] font-bold"
        />
        <span>
          {mastery
            ? t('ships.info.mastery', { level: romanLevel(mastery) })
            : t('ships.info.masteryNone')}
        </span>
      </div>
    </>
  );
}

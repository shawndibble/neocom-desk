/**
 * The trip rail's meters for a Cargo Space of several holds: one named bar
 * per hold, so a hauler sees which is full. A hold no candidate fits stays
 * empty rather than reading as spare room.
 */
import { useTranslation } from 'react-i18next';
import type { HoldUse } from '@/engine/market/haulingPlan';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatTripM3 } from './format';

export function HaulingHoldMeters({ holds }: { holds: readonly HoldUse[] }) {
  const { t } = useTranslation();
  return (
    <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
      {holds.map((hold) => {
        const counts = {
          name: t(`market.hauling.holds.${hold.kind}`),
          used: formatTripM3(hold.usedM3),
          total: formatTripM3(hold.capacityM3),
        };
        return (
          <li key={hold.kind} className="flex min-w-0 items-center gap-2">
            <ProgressBar
              label={t('market.hauling.plan.holdNamedAria', counts)}
              value={hold.usedM3}
              max={hold.capacityM3}
              size="xs"
              surface="panel-2"
              className="w-12 shrink-0"
            />
            <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">
              {t('market.hauling.plan.holdNamed', counts)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

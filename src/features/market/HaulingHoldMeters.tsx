/**
 * The trip rail's meters for a Cargo Space of several holds: one named bar
 * per hold, so a hauler sees which is full. A hold no candidate fits stays
 * empty rather than reading as spare room.
 */
import { useTranslation } from 'react-i18next';
import type { HoldUse } from '@/engine/market/haulingPlan';
import { formatTripM3 } from './format';

const pct = (hold: HoldUse) => Math.min(100, (hold.usedM3 / hold.capacityM3) * 100);

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
            <div
              role="img"
              aria-label={t('market.hauling.plan.holdNamedAria', counts)}
              className="h-1 w-12 shrink-0 bg-line"
            >
              <div className="h-full bg-accent" style={{ width: `${pct(hold)}%` }} />
            </div>
            <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">
              {t('market.hauling.plan.holdNamed', counts)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

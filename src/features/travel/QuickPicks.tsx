/**
 * "Go to" chips under Route Safety's destination field: the trade hubs and the
 * nearest Incursion's staging system, each one tap to the trip's next stop.
 * A place to go, never a verdict on it.
 */
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { nearestIncursion } from '@/engine/incursions/incursionRows';
import { quickPicks, type QuickPick } from '@/engine/route/quickPicks';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import { useSolarSystemIndex } from '@/features/route/useSolarSystems';
import { TRADE_HUBS } from '@/market/hubs';
import { useIncursions } from './useIncursions';

export function QuickPicks({
  current,
  taken,
  onPick,
}: {
  current: Pick<CurrentSystemState, 'systemId' | 'loaded'>;
  /** The trip's From and Stops. */
  taken: ReadonlySet<number>;
  onPick: (systemId: number) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const systems = useSolarSystemIndex();
  const { rows } = useIncursions(current);
  const nearest = nearestIncursion(rows);
  const picks = useMemo(
    () =>
      quickPicks({
        hubs: TRADE_HUBS.map((hub) => ({ systemId: hub.systemId, name: hub.systemName })),
        incursion:
          nearest === null
            ? null
            : {
                systemId: nearest.stagingSystemId,
                name: systems?.get(nearest.stagingSystemId)?.name ?? '',
              },
        taken,
      }).filter((pick) => pick.name !== ''),
    [nearest, systems, taken]
  );
  if (picks.length === 0) return null;
  const label = (pick: QuickPick) =>
    pick.kind === 'incursion' ? t('travel.quick.incursion', { system: pick.name }) : pick.name;
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
      <span id={labelId} className="text-xs font-semibold uppercase tracking-wider text-text-dim">
        {t('travel.quick.label')}
      </span>
      {picks.map((pick) => (
        <Button key={pick.systemId} size="sm" onClick={() => onPick(pick.systemId)}>
          {label(pick)}
        </Button>
      ))}
    </div>
  );
}

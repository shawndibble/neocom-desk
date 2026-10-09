/**
 * The two ship lists on a pilot's profile, side by side (stacked on a phone):
 * the hulls they fly on kills (zKillboard's all-time top ships) and the hulls
 * they kill most (from their latest kills). Either column drops out when its
 * data is not in: the stats are still loading or failed, or no kill list came.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import { topShips, type KillRecord } from '@/engine/pilotList/killActivity';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemInfoLink } from '@/features/entities';
import type { PilotTopShip } from '@/lib/zkillboard';

/** Hulls listed in each column. */
const HULLS_SHOWN = 5;

interface Hull {
  shipTypeId: number;
  count: number;
}

export function PilotShips({
  kills,
  flown,
}: {
  /** Their dated kills; null while loading or when zKillboard failed. */
  kills: readonly KillRecord[] | null;
  /** zKillboard's all-time top ships; null when the stats are not in. */
  flown: readonly PilotTopShip[] | null;
}) {
  const { t } = useTranslation();
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const flew = useMemo<Hull[]>(
    () =>
      (flown ?? [])
        .slice(0, HULLS_SHOWN)
        .map((ship) => ({ shipTypeId: ship.shipTypeId, count: ship.kills })),
    [flown]
  );
  const killed = useMemo<Hull[]>(
    () =>
      kills === null
        ? []
        : topShips(
            kills.map((kill) => kill.victimShipTypeId),
            HULLS_SHOWN
          ),
    [kills]
  );

  const idKey = [...new Set([...flew, ...killed].map((hull) => hull.shipTypeId))]
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    if (idKey === '') return;
    let cancelled = false;
    void loadTypeNames(idKey.split(',').map(Number))
      .then((loaded) => {
        if (!cancelled) setNames(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  if (flew.length === 0 && killed.length === 0) return null;
  const name = (id: number) => names.get(id) ?? t('common.unknownType', { id });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {flew.length > 0 && (
        <HullColumn
          title={t('travel.pilot.ships.flies')}
          hulls={flew}
          name={name}
          basis={t('travel.pilot.ships.fliesBasis')}
        />
      )}
      {killed.length > 0 && kills !== null && (
        <HullColumn
          title={t('travel.pilot.ships.killed')}
          hulls={killed}
          name={name}
          basis={t('travel.pilot.activity.basis', { count: kills.length })}
        />
      )}
    </div>
  );
}

function HullColumn({
  title,
  hulls,
  name,
  basis,
}: {
  title: string;
  hulls: Hull[];
  name: (id: number) => string;
  basis: string;
}) {
  return (
    <section className="min-w-0 space-y-1.5" aria-label={title}>
      <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">{title}</h3>
      <ul className="space-y-1 text-sm">
        {hulls.map((hull) => (
          <li key={hull.shipTypeId} className="flex items-center gap-2">
            <TypeIcon
              typeId={hull.shipTypeId}
              size={32}
              width={20}
              height={20}
              className="rounded-xs border border-line"
            />
            <span className="min-w-0 flex-1 truncate">
              <ItemInfoLink typeId={hull.shipTypeId}>{name(hull.shipTypeId)}</ItemInfoLink>
            </span>
            <span className="text-xs text-text-dim tabular-nums">{hull.count}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] text-text-dim">{basis}</p>
    </section>
  );
}

/**
 * Every faction the tree has, one button each: emblem, name, and how many of
 * its hulls the pilot can fly. Scrolls sideways rather than wrapping.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import type { ShipTreeData } from '@/sde/types';
import { factionEmblemUrl } from './shipTreeAssets';
import { flyableCount } from './shipTreeModel';

export function FactionBar({
  data,
  factionID,
  statuses,
  onFaction,
}: {
  data: ShipTreeData;
  factionID: number;
  statuses: ReadonlyMap<number, ShipTreeHullStatus>;
  onFaction: (factionID: number) => void;
}) {
  const { t } = useTranslation();
  const counts = useMemo(
    () =>
      new Map(
        data.factions.map((f) => [
          f.id,
          flyableCount(
            data.ships.filter((s) => s.factionID === f.id),
            statuses
          ),
        ])
      ),
    [data, statuses]
  );
  return (
    <div
      role="group"
      aria-label={t('ships.tree.factions')}
      className="flex gap-1 overflow-x-auto pb-1"
    >
      {data.factions.map((f) => {
        const c = counts.get(f.id) ?? { total: 0, flyable: 0 };
        const emblem = factionEmblemUrl(f.id);
        const current = f.id === factionID;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={current}
            onClick={() => onFaction(f.id)}
            title={f.description}
            className={cx(
              'shrink-0 rounded-xs border px-2 py-1 text-left text-xs whitespace-nowrap',
              current
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-text-dim hover:border-line-bright'
            )}
          >
            {emblem && (
              <img
                src={emblem}
                alt=""
                width={16}
                height={16}
                className="mr-1.5 inline-block align-[-3px]"
              />
            )}
            <span className="font-semibold">{f.name}</span>
            <span className="ml-1.5 tabular-nums opacity-80">
              {c.flyable}/{c.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}

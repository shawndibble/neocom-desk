/**
 * Every faction the tree has, one button each: emblem, name, and how many of
 * its hulls the pilot can fly. Scrolls sideways rather than wrapping. The
 * ladder's and a phone's picker; a wider map has `FactionGrid` inside it.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  controlHeightClassName,
  focusRingClassName,
  interactiveClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import type { ShipTreeData } from '@/sde/types';
import { factionEmblemUrl } from './shipTreeAssets';
import { flyableCount, inGameFactionOrder } from './shipTreeModel';

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
      {inGameFactionOrder(data.factions).map((f) => {
        const c = counts.get(f.id) ?? { total: 0, flyable: 0 };
        const emblem = factionEmblemUrl(f.id);
        const current = f.id === factionID;
        return (
          <Tooltip key={f.id} content={f.description}>
            <button
              type="button"
              aria-pressed={current}
              onClick={() => onFaction(f.id)}
              className={cx(
                controlHeightClassName.md,
                interactiveClassName,
                focusRingClassName,
                'flex shrink-0 items-center rounded-xs border px-2 text-left text-xs whitespace-nowrap',
                toggleChipStateClassName(current)
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
          </Tooltip>
        );
      })}
    </div>
  );
}

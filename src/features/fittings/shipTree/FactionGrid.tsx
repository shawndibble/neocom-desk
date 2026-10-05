/**
 * The map's faction picker, in the in-game panel's place and shape: an icon
 * grid in the canvas's top-left corner, with the chosen faction's name,
 * flyable count and blurb under it. Phones and the ladder keep `FactionBar`.
 */
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { ShipTreeData } from '@/sde/types';
import { factionEmblemUrl } from './shipTreeAssets';
import { flyableCount, inGameFactionOrder } from './shipTreeModel';

export const FactionGrid = memo(function FactionGrid({
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
  const factions = useMemo(() => inGameFactionOrder(data.factions), [data]);
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
  const current = factions.find((f) => f.id === factionID);
  const currentCount = counts.get(factionID) ?? { flyable: 0, total: 0 };
  const currentEmblem = factionEmblemUrl(factionID);

  return (
    <div className="isis-overlay absolute top-3 left-3 z-10 w-[14.5rem] space-y-2 p-2">
      <div role="group" aria-label={t('ships.tree.factions')} className="grid grid-cols-5 gap-1">
        {factions.map((f) => {
          const c = counts.get(f.id) ?? { flyable: 0, total: 0 };
          const emblem = factionEmblemUrl(f.id);
          return (
            <Tooltip key={f.id} content={`${f.name} — ${t('ships.tree.flyableOfTotal', c)}`}>
              <button
                type="button"
                aria-pressed={f.id === factionID}
                aria-label={f.name}
                onClick={() => onFaction(f.id)}
                className="isis-faction"
              >
                {emblem ? (
                  <img src={emblem} alt="" width={28} height={28} draggable={false} />
                ) : (
                  <span className="text-[0.625rem] font-bold">{f.name.slice(0, 3)}</span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {current && (
        <div className="isis-overlay-divider pt-2 text-xs">
          <div className="flex items-center gap-2">
            {currentEmblem && <img src={currentEmblem} alt="" width={24} height={24} />}
            <div className="min-w-0">
              <div className="truncate font-semibold text-text">{current.name}</div>
              <div className="text-text-dim tabular-nums">
                {t('ships.tree.flyableOfTotal', currentCount)}
              </div>
            </div>
          </div>
          {current.description && (
            <p className="mt-1.5 leading-snug text-text-dim">{current.description}</p>
          )}
        </div>
      )}
    </div>
  );
});

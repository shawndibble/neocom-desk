/**
 * The richness override for one of the pilot's own colonies (issue #2685): the
 * Map drawer `?planet=<id>` opens, and the Colonies row links to.
 *
 * "Which of these would you pull here?" is a membership question, so it is a
 * chip row, one tap per answer (the control the Advisor's resource picker
 * was). The pick narrows the resources this colony's rebuild advice and the
 * Plan solver score (`richnessOverride.ts`), on Plan, Map and Colonies alike.
 * Optional: with nothing picked, every resource the planet type yields counts.
 */
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';
import { db } from '@/db';
import { clearPlanetRichness, setPlanetRichness } from '@/sync';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { planetName } from './mapText';
import { PlanetImage } from '../PlanetImage';

export interface RichnessResource {
  typeId: number;
  name: string;
}

export function ColonyRichness({
  planetId,
  type,
  resources,
  onClose,
}: {
  planetId: number;
  type: PlanetType;
  /** Every P0 this planet type yields. */
  resources: readonly RichnessResource[];
  /** Shown only where the drawer's own close is absent (the docked panel). */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  // An array, so "no row yet" (empty) differs from "not read yet" (undefined).
  const rows = useLiveQuery(
    () => db.planetRichness.where('planetId').equals(planetId).toArray(),
    [planetId]
  );
  const saved = rows?.[0];
  const loaded = rows !== undefined;
  const yields = new Set(resources.map((resource) => resource.typeId));
  const savedPicks = (saved?.order ?? []).filter((id) => yields.has(id));

  // Taps build on the pick shown, not the last save, and writes run one after
  // another: a quick second tap must not drop the first, nor a clear race a
  // pending save. Once the live query shows what was written it is the source.
  const savedKey = savedPicks.join(',');
  const [shown, setShown] = useState<{ key: string; picks: number[] | null }>({
    key: savedKey,
    picks: null,
  });
  if (shown.key !== savedKey) setShown({ key: savedKey, picks: null });
  const picked = shown.key === savedKey && shown.picks ? shown.picks : savedPicks;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const change = (next: number[]) => {
    setShown({ key: savedKey, picks: next });
    queue.current = queue.current
      .then(() =>
        next.length === 0 ? clearPlanetRichness(planetId) : setPlanetRichness(planetId, next)
      )
      .catch(() => {});
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PlanetImage type={type} size={28} />
        <p className="text-sm text-text-dim">{planetName(t, type)}</p>
        <span className="ml-auto inline-flex h-[1.125rem] items-center rounded-xs border border-line px-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piMap.richness.optional')}
        </span>
      </div>
      <p className="text-xs text-text-dim">{t('piMap.richness.explain')}</p>
      <div
        role="group"
        aria-label={t('piMap.richness.pickLabel')}
        className="flex flex-wrap items-center gap-1"
      >
        {resources.map((resource) => (
          <FilterChip
            key={resource.typeId}
            label={resource.name}
            disabled={!loaded}
            selected={picked.includes(resource.typeId)}
            onToggle={() =>
              change(
                picked.includes(resource.typeId)
                  ? picked.filter((id) => id !== resource.typeId)
                  : [...picked, resource.typeId]
              )
            }
          />
        ))}
        {picked.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => change([])}>
            {t('piMap.richness.clear')}
          </Button>
        )}
      </div>
      {onClose && (
        <Button size="sm" onClick={onClose}>
          {t('piMap.richness.done')}
        </Button>
      )}
    </div>
  );
}

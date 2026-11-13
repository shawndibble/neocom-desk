import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, SearchInput, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { romanLevel } from '@/engine/projection';
import {
  buildHullCatalogue,
  searchHulls,
  type HullClass,
  type HullEntry,
} from '@/engine/fittings/hullCatalogue';
import type { LoadedFitting } from '@/engine/fittings/load';
import { CatalogueLoadingNote } from './FittingDataNotices';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HullPickerRow } from './HullPickerRow';
import { FlyDot } from './shipTree/FlyDot';
import { flyLabel } from './shipTree/flyLabel';
import { useHullFlyMarks, type HullFlyMark, type HullFlyMarks } from './useHullFlyMarks';
import type { FittingCatalogue } from './useFittingCatalogue';
import { useRecentHullIds } from './useRecentHulls';
import { guarded } from '@/app/routeChunks';

const PopularFitsPanel = lazy(() =>
  guarded(() => import('./PopularFitsPanel')).then((m) => ({ default: m.PopularFitsPanel }))
);

interface HullPickerProps {
  catalogue: FittingCatalogue | null;
  /** Opens a new Fitting on the chosen hull. */
  onStart: (hull: HullEntry) => void;
  /** Opens one of the chosen hull's Popular fits; omitted, the panel isn't shown. */
  onOpenPopular?: (loaded: LoadedFitting) => void;
}

/**
 * "New fitting" from a hull (scope decisions `20260924-215855`, and the
 * two-pane layout's): hulls on the left — a search over Ships market classes,
 * or the Character's recent hulls before anything is typed, optionally only
 * the hulls they can fly — and the picked hull on the right, with Start empty
 * fit and its Popular fits. On a phone the two are screens in turn: picking a
 * hull shows it, Back returns to the list. Needs only the static market data,
 * so it works before the ship data (dogma engine) has downloaded. Each hull
 * carries the Ship Tree's can-fly mark for the active Character once that has
 * loaded (#6011).
 */
export function HullPicker(props: HullPickerProps) {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  // No Character, no marks: the Ship Tree's data isn't loaded at all.
  return characterId === null ? (
    <HullPickerView {...props} characterId={null} flyMarks={null} />
  ) : (
    <MarkedHullPicker {...props} characterId={characterId} />
  );
}

function MarkedHullPicker({ characterId, ...props }: HullPickerProps & { characterId: number }) {
  return (
    <HullPickerView {...props} characterId={characterId} flyMarks={useHullFlyMarks(characterId)} />
  );
}

function HullPickerView({
  catalogue,
  onStart,
  onOpenPopular,
  characterId,
  flyMarks,
}: HullPickerProps & { characterId: number | null; flyMarks: HullFlyMarks | null }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<HullEntry | null>(null);
  const [flyOnly, setFlyOnly] = useState(false);
  const recentIds = useRecentHullIds(characterId);

  const hulls = useMemo(
    () =>
      catalogue === null
        ? []
        : buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes),
    [catalogue]
  );
  const hasQuery = query.trim() !== '';
  const shown = useMemo((): HullClass[] => {
    if (!hasQuery) return [];
    const flyable = (hull: HullEntry) => flyMarks?.(hull.typeId)?.status.canFly === true;
    return searchHulls(hulls, query)
      .map((hullClass) => ({
        ...hullClass,
        hulls: flyOnly ? hullClass.hulls.filter(flyable) : hullClass.hulls,
      }))
      .filter((hullClass) => hullClass.hulls.length > 0);
  }, [hulls, query, hasQuery, flyOnly, flyMarks]);
  const recent = useMemo(() => {
    const byId = new Map(hulls.flatMap((hullClass) => hullClass.hulls).map((h) => [h.typeId, h]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((hull): hull is HullEntry => hull !== undefined)
      .filter((hull) => !flyOnly || flyMarks?.(hull.typeId)?.status.canFly === true);
  }, [hulls, recentIds, flyOnly, flyMarks]);

  const row = (hull: HullEntry) => (
    <li key={hull.typeId}>
      <HullPickerRow
        hull={hull}
        mark={flyMarks?.(hull.typeId)}
        marked={flyMarks !== null}
        selected={selected?.typeId === hull.typeId}
        onSelect={() => setSelected(hull)}
        onStart={() => onStart(hull)}
      />
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      {/* A phone shows one pane at a time: the list until a hull is picked. */}
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col gap-3 md:w-72 md:flex-none',
          selected !== null && 'max-md:hidden'
        )}
      >
        <SearchInput
          aria-label={t('fittings.start.searchHulls')}
          placeholder={t('fittings.start.searchHullsPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {flyMarks !== null && (
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-text-dim md:min-h-7">
            <Checkbox checked={flyOnly} onChange={() => setFlyOnly(!flyOnly)} />
            {t('fittings.start.onlyFlyable')}
          </label>
        )}
        {catalogue === null ? (
          <CatalogueLoadingNote />
        ) : !hasQuery ? (
          recent.length > 0 ? (
            <section className="min-h-0 overflow-y-auto">
              <h3 className={cx(eyebrowClassName, 'mb-1')}>{t('fittings.start.recentHulls')}</h3>
              <ul>{recent.map(row)}</ul>
            </section>
          ) : (
            <p className="text-xs text-text-dim">{t('fittings.start.searchToBegin')}</p>
          )
        ) : shown.length === 0 ? (
          <p className="text-xs text-text-dim">
            {t(flyOnly ? 'fittings.start.noFlyableHulls' : 'fittings.start.noHulls')}
          </p>
        ) : (
          <div data-testid="hull-list" className="min-h-0 overflow-y-auto">
            {shown.map((hullClass) => (
              <section key={hullClass.id} className="mb-3">
                <h3 className={cx(eyebrowClassName, 'mb-1 flex justify-between')}>
                  <span>{hullClass.name}</span>
                  <span className="tabular-nums">{hullClass.hulls.length}</span>
                </h3>
                <ul>{hullClass.hulls.map(row)}</ul>
              </section>
            ))}
          </div>
        )}
        {(hasQuery || recent.length > 0) && (
          <p className="text-xs text-text-dim max-md:hidden">{t('fittings.start.pickAHull')}</p>
        )}
      </div>
      <div
        className={cx(
          'min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto md:flex md:border-l md:border-line md:pl-4',
          selected ? 'flex' : 'hidden'
        )}
      >
        {selected ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="self-start md:hidden"
              onClick={() => setSelected(null)}
            >
              <Icon.Back aria-hidden="true" />
              {t('fittings.start.backToHulls')}
            </Button>
            <SelectedHull
              hull={selected}
              mark={flyMarks?.(selected.typeId)}
              onStart={() => onStart(selected)}
            />
            {onOpenPopular && (
              <Suspense fallback={null}>
                <PopularFitsPanel
                  key={selected.typeId}
                  shipTypeId={selected.typeId}
                  hullName={selected.name}
                  capped={false}
                  onOpen={onOpenPopular}
                />
              </Suspense>
            )}
          </>
        ) : (
          <EmptyState
            className="m-auto max-w-md"
            title={t('fittings.start.pickTitle')}
            hint={t('fittings.start.pickHint')}
          />
        )}
      </div>
    </div>
  );
}

/** The picked hull: its icon, name and class, the Ship Tree's can-fly mark and mastery, and Start empty fit. */
function SelectedHull({
  hull,
  mark,
  onStart,
}: {
  hull: HullEntry;
  mark: HullFlyMark | undefined;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const mastery = mark?.status.mastery ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TypeIcon typeId={hull.typeId} size={64} width={56} height={56} />
      <div className="min-w-0 flex-1 basis-40">
        <h3 className="text-base font-semibold">{hull.name}</h3>
        <p className="text-xs text-text-dim">{hull.group}</p>
        {mark && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
            <span className="flex items-center gap-1.5">
              <FlyDot status={mark.status} />
              {flyLabel(t, mark.status)}
            </span>
            {mastery > 0 && (
              <span className="text-text-dim">
                {t('ships.info.mastery', { level: romanLevel(mastery) })}
              </span>
            )}
          </p>
        )}
      </div>
      <Button variant="primary" className="max-md:w-full" onClick={onStart}>
        {t('fittings.start.startEmptyFit')}
      </Button>
    </div>
  );
}

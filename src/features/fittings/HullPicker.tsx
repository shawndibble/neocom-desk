import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, TypeIcon } from '@/components/ui';
import { buildHullCatalogue, searchHulls, type HullEntry } from '@/engine/fittings/hullCatalogue';
import type { LoadedFitting } from '@/engine/fittings/load';
import { CatalogueLoadingNote } from './FittingDataNotices';
import { FlyDot } from './shipTree/FlyDot';
import { flyLabel } from './shipTree/flyLabel';
import { useHullFlyMarks } from './useHullFlyMarks';
import type { FittingCatalogue } from './useFittingCatalogue';
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
 * "New fitting from a hull" (scope decision `20260924-215855`): search
 * (nothing is listed until the player types), hulls grouped by Ships market
 * class, pick one, and Start fitting opens
 * the bare hull. Needs only the static market data, so it works before the
 * ship data (dogma engine) has downloaded. Each hull carries the Ship Tree's
 * can-fly mark for the active Character once that has loaded (#6011).
 */
export function HullPicker({ catalogue, onStart, onOpenPopular }: HullPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<HullEntry | null>(null);
  const flyMarks = useHullFlyMarks();

  const hulls = useMemo(
    () =>
      catalogue === null
        ? []
        : buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes),
    [catalogue]
  );
  const hasQuery = query.trim() !== '';
  const shown = useMemo(
    () => (hasQuery ? searchHulls(hulls, query) : []),
    [hulls, query, hasQuery]
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SearchInput
        aria-label={t('fittings.start.searchHulls')}
        placeholder={t('fittings.start.searchHullsPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {catalogue === null ? (
        <CatalogueLoadingNote />
      ) : !hasQuery ? (
        <p className="text-xs text-text-dim">{t('fittings.start.searchToBegin')}</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.start.noHulls')}</p>
      ) : (
        <div data-testid="hull-list" className="max-h-[32rem] overflow-y-auto">
          {/* The height cap lives here, not on the columns box: a capped multi-column box spills extra columns sideways instead of scrolling down. */}
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {shown.map((hullClass) => (
              <section key={hullClass.id} className="mb-3 break-inside-avoid">
                <h3 className={cx(eyebrowClassName, 'mb-1 flex justify-between')}>
                  <span>{hullClass.name}</span>
                  <span className="tabular-nums">{hullClass.hulls.length}</span>
                </h3>
                <ul>
                  {hullClass.hulls.map((hull) => {
                    const isSelected = selected?.typeId === hull.typeId;
                    const mark = flyMarks?.(hull.typeId);
                    return (
                      <li key={hull.typeId}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={
                            mark
                              ? t('ships.tree.tileLabel', {
                                  name: hull.name,
                                  status: mark.needsOmega
                                    ? `${flyLabel(t, mark.status)}, ${t('ships.tree.omega')}`
                                    : flyLabel(t, mark.status),
                                })
                              : undefined
                          }
                          onClick={() => setSelected(hull)}
                          onDoubleClick={() => onStart(hull)}
                          className={cx(
                            'flex min-h-9 w-full items-center gap-2 px-2 text-left text-sm',
                            rowInteractiveClassName,
                            focusRingInsetClassName,
                            isSelected
                              ? `${selectedRowClassName} text-accent`
                              : 'border-l-2 border-l-transparent'
                          )}
                        >
                          {flyMarks && (
                            // Same width marked or not, so names line up down the column.
                            <span className="flex w-2.5 shrink-0 justify-center">
                              {mark && <FlyDot status={mark.status} />}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">{hull.name}</span>
                          {mark?.needsOmega && (
                            <span aria-hidden="true" className="font-serif font-bold text-omega">
                              Ω
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {selected ? (
          <>
            <TypeIcon typeId={selected.typeId} size={64} width={44} height={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{selected.name}</p>
              <p className="truncate text-xs text-text-dim">{selected.group}</p>
            </div>
          </>
        ) : (
          <p className="min-w-0 flex-1 text-xs text-text-dim">{t('fittings.start.pickAHull')}</p>
        )}
        <Button
          variant="primary"
          disabled={selected === null}
          onClick={() => selected && onStart(selected)}
        >
          {t('fittings.start.startFitting')}
        </Button>
      </div>
      {selected && onOpenPopular && (
        <Suspense fallback={null}>
          <PopularFitsPanel
            shipTypeId={selected.typeId}
            hullName={selected.name}
            onOpen={onOpenPopular}
          />
        </Suspense>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, TypeIcon } from '@/components/ui';
import { buildHullCatalogue, searchHulls, type HullEntry } from '@/engine/fittings/hullCatalogue';
import type { FittingCatalogue } from './useFittingCatalogue';

interface HullPickerProps {
  catalogue: FittingCatalogue | null;
  /** Opens a new Fitting on the chosen hull. */
  onStart: (hull: HullEntry) => void;
}

/**
 * "New fitting from a hull" (scope decision `20260924-215855`): search, or
 * browse the Ships market groups by class, pick one, and Start fitting opens
 * the bare hull. Needs only the static market data, so it works before the
 * ship data (dogma engine) has downloaded.
 */
export function HullPicker({ catalogue, onStart }: HullPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<HullEntry | null>(null);

  const hulls = useMemo(
    () =>
      catalogue === null
        ? []
        : buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes),
    [catalogue]
  );
  const shown = useMemo(() => searchHulls(hulls, query), [hulls, query]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SearchInput
        aria-label={t('fittings.start.searchHulls')}
        placeholder={t('fittings.start.searchHullsPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {catalogue === null ? (
        <p className="text-xs text-text-dim">{t('fittings.add.loadingCatalogue')}</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.start.noHulls')}</p>
      ) : (
        <div data-testid="hull-list" className="max-h-[32rem] overflow-y-auto">
          {/* The height cap lives here, not on the columns box: a capped multi-column box spills extra columns sideways instead of scrolling down. */}
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {shown.map((hullClass) => (
              <section key={hullClass.id} className="mb-3 break-inside-avoid">
                <h3 className="mb-1 flex justify-between text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  <span>{hullClass.name}</span>
                  <span className="tabular-nums">{hullClass.hulls.length}</span>
                </h3>
                <ul>
                  {hullClass.hulls.map((hull) => {
                    const isSelected = selected?.typeId === hull.typeId;
                    return (
                      <li key={hull.typeId}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          title={hull.group}
                          onClick={() => setSelected(hull)}
                          onDoubleClick={() => onStart(hull)}
                          className={`flex min-h-11 w-full md:min-h-9 items-center border-l-2 px-2 text-left text-sm hover:bg-panel-2 ${isSelected ? 'border-accent bg-panel-2 text-accent' : 'border-transparent'}`}
                        >
                          {hull.name}
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
    </div>
  );
}

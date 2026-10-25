import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RowMoreActions, SearchInput, TextInput, TypeIcon } from '@/components/ui';
import {
  disabledClassName,
  focusRingInsetClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { CANDIDATE_LIMIT } from '@/engine/fittings/candidates';
import type { Fitting } from '@/engine/fittings/types';
import { AddCargoMenuItems, FittingItemMenu } from './FittingItemMenu';
import { useFittingItemActions } from './fittingItemActions';
import { CatalogueLoadingNote } from './FittingDataNotices';
import type { FittingCatalogue } from './useFittingCatalogue';

/**
 * Add cargo: any market item, found by name, in the quantity asked — the
 * hold takes what the ring has no slot for (ammo, paste, filaments, a depot).
 */
export function CargoTab({
  catalogue,
  cargo,
  onAddCargo,
}: {
  catalogue: FittingCatalogue | null;
  /** What the hold already carries: those results get the List cargo row's menu. */
  cargo: Fitting['cargo'];
  onAddCargo: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const inHold = useMemo(() => new Set(cargo.map((item) => item.typeId)), [cargo]);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState('1');
  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (catalogue === null || trimmed === '') return [];
    return catalogue.marketTypes
      .filter((entry) => entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed]);
  const count = Math.floor(Number(quantity));
  const valid = Number.isFinite(count) && count >= 1;
  return (
    <div className="space-y-2">
      <SearchInput
        aria-label={t('fittings.add.cargoSearchLabel')}
        placeholder={t('fittings.add.cargoSearchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-text-dim">
        {t('fittings.edit.quantity')}
        <TextInput
          type="number"
          min={1}
          size="sm"
          className="w-24"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      {catalogue === null ? (
        <CatalogueLoadingNote />
      ) : trimmed === '' ? (
        <p className="text-xs text-text-dim">{t('fittings.add.cargoHint')}</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
      ) : (
        <ul>
          {results.map((entry) => {
            const row = (
              <li key={entry.typeId} className="flex items-center">
                <button
                  type="button"
                  disabled={!valid}
                  onClick={() => onAddCargo(entry.typeId, count)}
                  className={cx(
                    'flex min-h-9 w-full items-center gap-2 px-2 text-left text-xs',
                    rowInteractiveClassName,
                    focusRingInsetClassName,
                    disabledClassName
                  )}
                >
                  <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-text-dim tabular-nums">
                    {t('fittings.add.cargoAddCount', { count: valid ? count : 0 })}
                  </span>
                </button>
                {actions && <RowMoreActions />}
              </li>
            );
            return actions ? (
              <FittingItemMenu
                key={entry.typeId}
                name={entry.name}
                items={
                  <AddCargoMenuItems
                    typeId={entry.typeId}
                    count={valid ? count : 0}
                    inHold={inHold.has(entry.typeId)}
                    onAddCargo={onAddCargo}
                  />
                }
              >
                {row}
              </FittingItemMenu>
            ) : (
              row
            );
          })}
        </ul>
      )}
    </div>
  );
}

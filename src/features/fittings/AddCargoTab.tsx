import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, RowMoreActions, SearchInput, TextInput, TypeIcon } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';
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
  const parsed = parseLocalizedNumber(quantity);
  const valid = parsed !== null && Number.isInteger(parsed) && parsed >= 1;
  const count = valid ? parsed : 0;
  const errorId = useId();
  const showError = !valid;
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
          inputMode="numeric"
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          size="sm"
          className="w-24"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      {showError && <FieldError id={errorId}>{t('fittings.add.cargoQuantityInvalid')}</FieldError>}
      {catalogue === null ? (
        <CatalogueLoadingNote />
      ) : trimmed === '' ? null : results.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.add.noResults')}</p>
      ) : (
        <ul>
          {results.map((entry) => {
            const row = (
              <li key={entry.typeId} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (valid) onAddCargo(entry.typeId, count);
                  }}
                  className={cx(
                    'flex min-h-9 w-full items-center gap-2 px-2 text-left text-xs',
                    rowInteractiveClassName,
                    focusRingInsetClassName
                  )}
                >
                  <TypeIcon typeId={entry.typeId} size={32} width={24} height={24} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-text-dim tabular-nums">
                    {t('fittings.add.cargoAddCount', { count })}
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
                    count={count}
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

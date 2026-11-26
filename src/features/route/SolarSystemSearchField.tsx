import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, SearchInput } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import {
  suggestionOptionClassName,
  suggestionPopupClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { SecurityStatus } from '@/components/SecurityStatus';
import { useCombobox } from '@/lib/useCombobox';
import { cx } from '@/lib/cx';
import type { PickedStation } from '@/features/places/placeSearch';
import { buildPickerOptions, pickedStationOf, type PickerOption } from './pickerOptions';
import { useKnownPlaces } from '@/features/places/useKnownPlaces';
import { useSolarSystemList } from './useSolarSystems';

const MATCH_LIMIT = 8;
export function SolarSystemSearchField({
  onChange,
  ariaLabel,
  exclude,
  autoFocus = false,
  className,
  places = false,
}: {
  onChange: (systemId: number, station?: PickedStation) => void;
  ariaLabel: string;
  exclude?: ReadonlySet<number>;
  autoFocus?: boolean;
  className?: string;
  places?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(true);
  const [wrapRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    'systems'
  );
  const trimmed = query.trim();
  const placeHits = useKnownPlaces(query, places, MATCH_LIMIT);
  const matches = useMemo(
    () =>
      systems && trimmed !== ''
        ? buildPickerOptions(systems, query, exclude, placeHits, MATCH_LIMIT)
        : [],
    [systems, query, trimmed, exclude, placeHits]
  );

  const combo = useCombobox({ count: matches.length, open: matches.length > 0 });

  function choose(option: PickerOption) {
    setQuery('');
    combo.reset();
    onChange(option.systemId, pickedStationOf(option));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter') {
      const pick = matches[combo.highlight ?? 0];
      if (pick) {
        event.preventDefault();
        choose(pick);
      }
    }
  }

  return (
    <div ref={wrapRef} tabIndex={-1} className={cx('relative focus:outline-none', className)}>
      <LiveStatus>{systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
      <SearchInput
        autoFocus={autoFocus}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          combo.reset();
        }}
        onKeyDown={onKeyDown}
        placeholder={t('jumpRange.searchPlaceholder')}
        aria-label={ariaLabel}
        {...combo.inputProps}
      />
      {systemsFailed && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-warning">
          <span>{t('jumpRange.systemsFailed')}</span>
          <Button
            size="sm"
            onClick={() => {
              holdRetryFocus();
              retrySystems();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {!systemsFailed && trimmed !== '' && matches.length === 0 && (
        <p
          className={cx(
            'absolute inset-x-0 top-full z-20 mt-1 flex items-center rounded-xs border border-line-bright bg-panel px-3 text-text-dim shadow-lg',
            tappableRowClassName
          )}
        >
          {systems === null ? t('jumpRange.searching') : t('jumpRange.noMatch')}
        </p>
      )}
      {matches.length > 0 && (
        <ul {...combo.listboxProps} aria-label={ariaLabel} className={suggestionPopupClassName}>
          {matches.map((option, index) => (
            <li
              key={option.key}
              {...combo.optionProps(index)}
              className={suggestionOptionClassName(index === combo.activeIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="min-w-0 truncate">{option.name}</span>
              {option.security !== null && (
                <SecurityStatus security={option.security} className="ml-1" />
              )}
              {places && (
                <span className="ml-2 text-xs text-text-dim">
                  {t(`travel.stops.kind.${option.kind}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

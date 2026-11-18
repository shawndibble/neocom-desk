/**
 * A solar system picker that is the search box itself, for a page whose next
 * step is naming a system: Route Safety's destination, before any route
 * exists. The same local snapshot and ranking as `SolarSystemPicker`, with the
 * results listed under the field rather than in a popover behind a button.
 *
 * With `places`, stations and known structures join the systems in one list
 * (issue #4964), each result marked as a system, station or structure. Picking
 * a station answers with its system and the station beside it.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, SearchInput } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { activeOptionClassName } from '@/components/ui/controlStyles';
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
  /** `station` is set when a station or structure was picked: `systemId` is its system. */
  onChange: (systemId: number, station?: PickedStation) => void;
  ariaLabel: string;
  /** Systems left out of the results, such as the trip's start. */
  exclude?: ReadonlySet<number>;
  autoFocus?: boolean;
  className?: string;
  /** Also search stations and known structures, not only systems. */
  places?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(true);
  // Retry's notice unmounts when the read restarts: focus waits on the field wrapper.
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
      {matches.length > 0 && (
        <ul
          {...combo.listboxProps}
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-xs border border-line-bright bg-panel p-1 shadow-lg"
        >
          {matches.map((option, index) => (
            <li
              key={option.key}
              {...combo.optionProps(index)}
              className={cx(
                'cursor-pointer rounded-xs px-2 py-1 hover:bg-panel-2 touch:flex touch:min-h-9 touch:items-center',
                index === combo.activeIndex && `bg-panel-2 ${activeOptionClassName}`
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.name}
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

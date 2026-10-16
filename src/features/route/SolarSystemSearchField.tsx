/**
 * A solar system picker that is the search box itself, for a page whose next
 * step is naming a system: Route Safety's destination, before any route
 * exists. The same local snapshot and ranking as `SolarSystemPicker`, with the
 * results listed under the field rather than in a popover behind a button.
 */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, SearchInput } from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { SecurityStatus } from '@/components/SecurityStatus';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { useSolarSystemList } from './useSolarSystems';

const MATCH_LIMIT = 8;
const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export function SolarSystemSearchField({
  onChange,
  ariaLabel,
  exclude,
  autoFocus = false,
  className,
}: {
  onChange: (systemId: number) => void;
  ariaLabel: string;
  /** Systems left out of the results, such as the trip's start. */
  exclude?: ReadonlySet<number>;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(true);
  // Retry's notice unmounts when the read restarts: focus waits on the field wrapper.
  const [wrapRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    'systems'
  );
  const matches = useMemo(
    () =>
      systems && query.trim() !== ''
        ? rankedSearch(
            exclude?.size ? systems.filter((system) => !exclude.has(system.id)) : systems,
            query,
            { primary: (system) => system.name, limit: MATCH_LIMIT }
          )
        : [],
    [systems, query, exclude]
  );

  function choose(system: SolarSystemEntry) {
    setQuery('');
    setHighlight(null);
    onChange(system.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter') {
      const pick = matches[highlight ?? 0];
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
          setHighlight(null);
        }}
        onKeyDown={onKeyDown}
        placeholder={t('jumpRange.searchPlaceholder')}
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-autocomplete="list"
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
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-xs border border-line-bright bg-panel p-1 shadow-lg"
        >
          {matches.map((system, index) => (
            <li
              key={system.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={cx(
                'cursor-pointer rounded-xs px-2 py-1 hover:bg-panel-2 touch:flex touch:min-h-11 touch:items-center',
                index === highlight && `bg-panel-2 ${activeOptionClassName}`
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(system)}
            >
              {system.name}
              <SecurityStatus security={system.security} className="ml-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

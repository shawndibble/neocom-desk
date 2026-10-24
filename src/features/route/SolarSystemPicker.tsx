/**
 * A solar system picker: a button that opens a search over every solar system
 * in the local snapshot, so picking one costs no ESI request.
 *
 * Shared by the Jump Range's Current System picker and Route Safety's From and
 * To (issue #2328). The snapshot is only fetched once the popover first opens.
 */
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  LiveStatus,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
} from '@/components/ui';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { SecurityStatus } from '@/components/SecurityStatus';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import type { PickedStation } from '@/features/places/placeSearch';
import { useKnownPlaces } from '@/features/places/useKnownPlaces';
import { buildPickerOptions, pickedStationOf, type PickerOption } from './pickerOptions';
import { useSolarSystemIndex, useSolarSystemList, useSystemName } from './useSolarSystems';

const MATCH_LIMIT = 8;

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export interface SolarSystemPickerProps {
  value: number | null;
  /** `station` is set when a station or structure was picked: `systemId` is its system. */
  onChange: (systemId: number, station?: PickedStation) => void;
  /** The trigger's accessible name. */
  ariaLabel: string;
  /** What the trigger shows; defaults to the picked system's name, or `placeholder`. */
  triggerLabel?: ReactNode;
  /** Shown on the trigger with nothing picked, when `triggerLabel` is not given. */
  placeholder?: string;
  disabled?: boolean;
  /** A line above the search box. */
  hint?: ReactNode;
  /** Below the results; `close` shuts the popover. */
  footer?: (close: () => void) => ReactNode;
  /** Systems left out of the results, such as ones already on a list. */
  exclude?: ReadonlySet<number>;
  /** Each result also shows its security status. */
  showSecurity?: boolean;
  /** The trigger button, for a caller handing focus to it. */
  triggerRef?: Ref<HTMLButtonElement>;
  /** Also search stations and known structures, not only systems (issue #4964). */
  places?: boolean;
}

export function SolarSystemPicker({
  value,
  onChange,
  ariaLabel,
  triggerLabel,
  placeholder,
  disabled = false,
  hint,
  footer,
  exclude,
  showSecurity = false,
  triggerRef,
  places = false,
}: SolarSystemPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(open);
  // Retry's notice unmounts when the read restarts: focus waits on the popover body.
  const [bodyRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    open
  );
  const valueName = useSystemName(triggerLabel === undefined ? value : null);

  const systemIndex = useSolarSystemIndex();
  const placeHits = useKnownPlaces(query, places && open, MATCH_LIMIT);
  const matches = useMemo(
    () =>
      systems
        ? buildPickerOptions(
            systems,
            query,
            exclude,
            placeHits,
            (id) => systemIndex?.get(id)?.security ?? null,
            MATCH_LIMIT
          )
        : [],
    [systems, query, exclude, placeHits, systemIndex]
  );

  function close() {
    setOpen(false);
    setQuery('');
    setHighlight(null);
  }

  function choose(option: PickerOption) {
    onChange(option.systemId, pickedStationOf(option));
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter' && highlight !== null && matches[highlight]) {
      event.preventDefault();
      choose(matches[highlight]);
    }
  }

  const shown = triggerLabel ?? (value === null ? (placeholder ?? '') : (valueName ?? '…'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Shrinks inside a tight row and ends in an ellipsis rather than
            widening the page or wrapping to a second line (issue #2519). */}
        <Button
          ref={triggerRef}
          disabled={disabled}
          aria-label={ariaLabel}
          className="max-w-full min-w-0 whitespace-nowrap"
        >
          <span className="truncate">{shown}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
          <LiveStatus>{systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
          {hint !== undefined && <p className="text-text-dim">{hint}</p>}
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('jumpRange.searchPlaceholder')}
            aria-label={t('jumpRange.searchPlaceholder')}
            aria-controls={listId}
            aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-autocomplete="list"
          />
          {systemsFailed && (
            // The list never loaded, so no result is a statement about any system.
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-warning">{t('jumpRange.systemsFailed')}</p>
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
            <ul id={listId} role="listbox" className="flex flex-col">
              {matches.map((option, index) => (
                <li
                  key={option.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={cx(
                    'cursor-pointer rounded-xs px-2 py-1 hover:bg-panel-2',
                    index === highlight && `bg-panel-2 ${activeOptionClassName}`
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  {option.name}
                  {showSecurity && option.security !== null && (
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
          {footer?.(close)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

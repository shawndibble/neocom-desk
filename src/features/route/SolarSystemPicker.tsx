/**
 * A solar system picker: a button that opens a search over every solar system
 * in the local snapshot, so picking one costs no ESI request.
 *
 * Shared by the Jump Range's Current System picker and Route Safety's From and
 * To (issue #2328). The snapshot is only fetched once the popover first opens.
 */
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger, SearchInput } from '@/components/ui';
import { SecurityStatus } from '@/components/SecurityStatus';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { useSolarSystems, useSystemName } from './useSolarSystems';

const MATCH_LIMIT = 8;

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export interface SolarSystemPickerProps {
  value: number | null;
  onChange: (systemId: number) => void;
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
}: SolarSystemPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();
  const systems = useSolarSystems(open);
  const valueName = useSystemName(triggerLabel === undefined ? value : null);

  const matches = useMemo(
    () =>
      systems
        ? rankedSearch(exclude?.size ? systems.filter((s) => !exclude.has(s.id)) : systems, query, {
            primary: (s) => s.name,
            limit: MATCH_LIMIT,
          })
        : [],
    [systems, query, exclude]
  );

  function close() {
    setOpen(false);
    setQuery('');
    setHighlight(null);
  }

  function choose(system: SolarSystemEntry) {
    onChange(system.id);
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
        <Button disabled={disabled} aria-label={ariaLabel} className="whitespace-nowrap">
          {shown}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex flex-col gap-2">
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
          {matches.length > 0 && (
            <ul id={listId} role="listbox" className="flex flex-col">
              {matches.map((system, index) => (
                <li
                  key={system.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={cx(
                    'cursor-pointer rounded-xs px-2 py-1 hover:bg-panel-2',
                    index === highlight && 'bg-panel-2'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(system)}
                >
                  {showSecurity ? (
                    <span className="flex items-center justify-between gap-2">
                      {system.name}
                      <SecurityStatus security={system.security} />
                    </span>
                  ) : (
                    system.name
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

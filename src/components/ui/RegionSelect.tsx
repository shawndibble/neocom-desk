import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SearchInput } from './SearchInput';
import * as Icon from './icons';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

export interface RegionSelectOption {
  readonly id: number;
  readonly name: string;
}

export interface RegionSelectProps {
  /** Any order — the control sorts by name itself. */
  options: readonly RegionSelectOption[];
  value: number | null;
  onChange: (regionId: number | null) => void;
  /** When given, an "All regions" row pinned at the top, standing for `null`. */
  allLabel?: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  'aria-label': string;
  className?: string;
  size?: ControlSize;
}

interface Row {
  id: number | null;
  name: string;
}

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * The one region picker. EVE has 60-odd k-space regions, too many to scan in
 * a plain `Select`, so this opens a type-to-filter list instead — always
 * alphabetical, whatever order the caller built its options in.
 *
 * Trigger looks and reads like `SelectTrigger` (`role="combobox"`, value as
 * its text). The list is the hand-built combobox shape from
 * docs/context/decisions/20260905-114550-hand-build-aria-comboboxes-rather-than-buy-radix.md:
 * focus stays in the search box, `aria-activedescendant` tracks the
 * highlight. Built on `Popover`, so it portals into a `Modal` when inside one.
 */
export function RegionSelect({
  options,
  value,
  onChange,
  allLabel,
  searchPlaceholder,
  noResultsLabel,
  'aria-label': ariaLabel,
  className,
  size = 'md',
}: RegionSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name)),
    [options]
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? sorted.filter((o) => o.name.toLowerCase().includes(needle)) : sorted;
  }, [sorted, query]);

  // The All row stays put while filtering: it is the way back out, not a match.
  const rows = useMemo<Row[]>(
    () => (allLabel === undefined ? matches : [{ id: null, name: allLabel }, ...matches]),
    [allLabel, matches]
  );
  const firstMatchIndex = allLabel === undefined ? 0 : 1;

  const selectedName =
    value === null ? allLabel : (sorted.find((o) => o.id === value)?.name ?? allLabel);

  useEffect(() => {
    if (highlight === null) return;
    document.getElementById(`${listId}-${highlight}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight, listId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      const index = (allLabel === undefined ? sorted : [null, ...sorted]).findIndex((o) =>
        o === null ? value === null : o.id === value
      );
      setHighlight(index === -1 ? null : index);
    }
  }

  function choose(row: Row) {
    onChange(row.id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, rows.length));
    } else if (event.key === 'Enter' && highlight !== null && rows[highlight]) {
      event.preventDefault();
      choose(rows[highlight]);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          className={cx(
            fieldBaseClassName,
            fieldSizeClassName[size],
            'flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap outline-none',
            className
          )}
        >
          <span className={cx('min-w-0 truncate', selectedName === undefined && 'text-text-dim')}>
            {selectedName}
          </span>
          <Icon.Expanded
            aria-hidden="true"
            size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
            className="shrink-0 text-text-dim"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 min-w-[var(--radix-popover-trigger-width)] p-0">
        <div className="p-1">
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              // Land on the first real match so Enter takes it straight away.
              setHighlight(next.trim() ? firstMatchIndex : null);
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              highlight === null || !rows[highlight] ? undefined : `${listId}-${highlight}`
            }
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="max-h-64 overflow-y-auto p-1"
        >
          {rows.map((row, index) => {
            const selected = row.id === value;
            return (
              <div
                key={row.id ?? 'all'}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm hover:bg-panel-2',
                  index === highlight && 'bg-panel-2'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(row)}
              >
                <span aria-hidden="true" className="inline-block w-3 text-center">
                  {selected ? '✓' : ''}
                </span>
                {row.name}
              </div>
            );
          })}
          {matches.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-text-dim">{noResultsLabel}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

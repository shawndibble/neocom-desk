import { LiveNote } from '@/components/ui/LiveStatus';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { LiveStatus } from './LiveStatus';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SearchInput } from './SearchInput';
import * as Icon from './icons';
import {
  activeOptionClassName,
  fieldBaseClassName,
  fieldSizeClassName,
  type ControlSize,
} from './controlStyles';

export interface RegionSelectOption {
  readonly id: number;
  readonly name: string;
}

export interface RegionSelectShortcut {
  label: string;
  disabled?: boolean;
  note?: string | null;
  onSelect: () => Promise<number | null | undefined> | number | null | undefined;
}

export interface RegionSelectProps {
  options: readonly RegionSelectOption[];
  value: number | null;
  onChange: (regionId: number | null) => void;
  allLabel?: string;
  placeholder?: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  'aria-label': string;
  className?: string;
  size?: ControlSize;
  active?: boolean;
  shortcut?: RegionSelectShortcut;
}

interface Row {
  id: number | null;
  name: string;
}

export function RegionSelect({
  options,
  value,
  onChange,
  allLabel,
  placeholder,
  searchPlaceholder,
  noResultsLabel,
  'aria-label': ariaLabel,
  className,
  size = 'md',
  active,
  shortcut,
}: RegionSelectProps) {
  const [open, setOpen] = useState(false);
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
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

  const rows = useMemo<Row[]>(
    () => (allLabel === undefined ? matches : [{ id: null, name: allLabel }, ...matches]),
    [allLabel, matches]
  );
  const firstMatchIndex = allLabel === undefined ? 0 : 1;

  const selectedName =
    value === null ? allLabel : (sorted.find((o) => o.id === value)?.name ?? allLabel);
  const triggerText = selectedName ?? placeholder;

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

  async function runShortcut() {
    if (!shortcut) return;
    const regionId = await shortcut.onSelect();
    if (regionId !== null && regionId !== undefined) {
      onChange(regionId);
      setOpen(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
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
          data-active={active || undefined}
          className={cx(
            fieldBaseClassName,
            fieldSizeClassName[size],
            'flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap data-[active]:border-accent',
            className
          )}
        >
          <span className={cx('min-w-0 truncate', selectedName === undefined && 'text-text-dim')}>
            {triggerText}
          </span>
          <Icon.Expanded
            aria-hidden="true"
            size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
            className="shrink-0 text-text-dim"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={ariaLabel}
        className="w-64 min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        <div className="p-1">
          <SearchInput
            autoFocus={!coarse}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
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
        {shortcut && (
          <div className="px-1 pb-1">
            <button
              type="button"
              disabled={shortcut.disabled}
              onClick={() => void runShortcut()}
              className="w-full rounded-xs px-2 py-1.5 text-left text-sm text-accent hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-text-dim disabled:hover:bg-transparent"
            >
              {shortcut.label}
            </button>
            {shortcut.note && (
              <LiveNote as="span" className="block px-2 text-xs text-text-dim">
                {shortcut.note}
              </LiveNote>
            )}
          </div>
        )}
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
                  index === highlight && `bg-panel-2 ${activeOptionClassName}`
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
            <p aria-hidden="true" className="px-2 py-1.5 text-sm text-text-dim">
              {noResultsLabel}
            </p>
          )}
        </div>
        <LiveStatus>{matches.length === 0 && noResultsLabel}</LiveStatus>
      </PopoverContent>
    </Popover>
  );
}

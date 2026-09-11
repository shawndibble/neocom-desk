import { useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import {
  filterMultiSelectGroups,
  type MultiSelectGroup,
  type MultiSelectOption,
} from '@/lib/multiSelectSearch';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SearchInput } from './SearchInput';
import { menuItemClassName } from './menuStyles';

export type { MultiSelectGroup, MultiSelectOption };

export interface MultiSelectProps<Id> {
  /** Rendered as the `PopoverTrigger`'s child — typically a `Button`. */
  trigger: ReactNode;
  /** Flat, ungrouped options. Ignored if `groups` is given. */
  options?: readonly MultiSelectOption<Id>[];
  /** Grouped options, each under its own heading. Takes precedence over `options`. */
  groups?: readonly MultiSelectGroup<Id>[];
  selected: ReadonlySet<Id>;
  onToggle: (id: Id) => void;
  searchPlaceholder: string;
  noResultsLabel: string;
  /**
   * Rendered above the search box — e.g. "select all" quick-actions. Given a
   * function, it's called with `close` so an action can dismiss the popover
   * after firing (unlike toggling an option, which stays open across
   * multiple picks).
   */
  extraContent?: ReactNode | ((close: () => void) => ReactNode);
  contentClassName?: string;
}

/**
 * A trigger-opened, checkbox-style multiselect with a type-to-filter search
 * box. Built on `Popover` rather than `DropdownMenu`: Radix's menu family
 * expects arrow-key/typeahead navigation between `menuitem`s, which conflicts
 * with a live text input inside the same content — see
 * docs/context/decisions/20260905-114550-hand-build-aria-comboboxes-rather-than-buy-radix.md.
 * Options use the `listbox`/`option` roles instead of Radix's `menuitemcheckbox`
 * for the same reason.
 */
export function MultiSelect<Id>({
  trigger,
  options,
  groups,
  selected,
  onToggle,
  searchPlaceholder,
  noResultsLabel,
  extraContent,
  contentClassName,
}: MultiSelectProps<Id>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedGroups = useMemo<readonly MultiSelectGroup<Id>[]>(
    () => groups ?? [{ label: '', options: options ?? [] }],
    [groups, options]
  );
  const filteredGroups = useMemo(
    () => filterMultiSelectGroups(normalizedGroups, query),
    [normalizedGroups, query]
  );
  const hasResults = filteredGroups.some((group) => group.options.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={cx('w-64 p-0', contentClassName)}>
        {typeof extraContent === 'function' ? extraContent(() => setOpen(false)) : extraContent}
        <div className="p-1">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
          {!hasResults && <p className="px-2 py-1.5 text-sm text-text-dim">{noResultsLabel}</p>}
          {filteredGroups.map((group) => (
            <div key={group.label}>
              {group.label && (
                <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {group.label}
                </p>
              )}
              {group.options.map((option) => {
                const checked = selected.has(option.id);
                return (
                  <div
                    key={String(option.id)}
                    role="option"
                    aria-selected={checked}
                    className={menuItemClassName}
                    onClick={() => onToggle(option.id)}
                  >
                    <span aria-hidden="true" className="inline-block w-3 text-center">
                      {checked ? '✓' : ''}
                    </span>
                    {option.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

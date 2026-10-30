import { eyebrowClassName } from './eyebrowClassName';
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import {
  filterMultiSelectGroups,
  type MultiSelectGroup,
  type MultiSelectOption,
} from '@/lib/multiSelectSearch';
import { LiveStatus } from './LiveStatus';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SearchInput } from './SearchInput';
import { activeOptionClassName, selectTriggerClassName, type ControlSize } from './controlStyles';
import { SelectChevron } from './SelectChevron';
import { menuItemClassName } from './menuStyles';

export type { MultiSelectGroup, MultiSelectOption };

export interface MultiSelectProps<Id> {
  /**
   * The trigger's visible text: the field's name ("Compare regions"), or a
   * value that names itself ("All locations"). Defaults to `label`.
   */
  triggerLabel?: string;
  /** A short dim read of the selection after `triggerLabel` — a count ("2 / 4"). */
  summary?: ReactNode;
  /**
   * The trigger's accessible name, when its visible text alone doesn't say
   * enough ("Compare regions, 2 of 4 picked" for "Compare regions 2 / 4").
   * Start it with the visible field name, so a speech user can say what they
   * see (WCAG 2.5.3). Without it, a `triggerLabel` that differs from `label`
   * is named "label: triggerLabel" ("Location: All locations"), the way
   * `CheckboxSelect` names its trigger; otherwise the visible text names it.
   */
  triggerAriaLabel?: string;
  /** The trigger's control size; share it with the row's other controls (DESIGN.md §3). */
  size?: ControlSize;
  /** The trigger's classes — its width in a toolbar row. */
  className?: string;
  /** Flat, ungrouped options. Ignored if `groups` is given. */
  options?: readonly MultiSelectOption<Id>[];
  /** Grouped options, each under its own heading. Takes precedence over `options`. */
  groups?: readonly MultiSelectGroup<Id>[];
  selected: ReadonlySet<Id>;
  onToggle: (id: Id) => void;
  /** Names the popover dialog and its listbox. */
  label: string;
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
  /**
   * Makes each group heading tickable: the checked state it shows, and what
   * ticking it does (usually ticking or clearing every option under it). A
   * search also matches heading text, keeping the whole group.
   */
  groupState?: (group: MultiSelectGroup<Id>) => boolean | 'mixed';
  onToggleGroup?: (group: MultiSelectGroup<Id>) => void;
}

/**
 * A select-shaped, checkbox-style multiselect with a type-to-filter search
 * box. Built on `Popover` rather than `DropdownMenu`: Radix's menu family
 * expects arrow-key/typeahead navigation between `menuitem`s, which conflicts
 * with a live text input inside the same content — see
 * docs/context/decisions/20260905-114550-hand-build-aria-comboboxes-rather-than-buy-radix.md.
 * Options use the `listbox`/`option` roles instead of Radix's `menuitemcheckbox`
 * for the same reason. Keyboard nav follows the same hand-built shape as
 * `RegionSelect`: focus stays in the search input, `aria-activedescendant`
 * tracks a roving highlight moved by arrow keys, and Enter acts on the
 * highlighted option — Space is left alone since typing one into the search
 * box must still insert a space, not toggle a row.
 */
export function MultiSelect<Id>({
  triggerLabel,
  summary,
  triggerAriaLabel,
  size = 'md',
  className,
  options,
  groups,
  selected,
  onToggle,
  label,
  searchPlaceholder,
  noResultsLabel,
  extraContent,
  contentClassName,
  groupState,
  onToggleGroup,
}: MultiSelectProps<Id>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();

  const normalizedGroups = useMemo<readonly MultiSelectGroup<Id>[]>(
    () => groups ?? [{ label: '', options: options ?? [] }],
    [groups, options]
  );
  const filteredGroups = useMemo(
    () => filterMultiSelectGroups(normalizedGroups, query, onToggleGroup !== undefined),
    [normalizedGroups, query, onToggleGroup]
  );
  const hasResults = filteredGroups.some((group) => group.options.length > 0);
  const tickableHeadings = onToggleGroup !== undefined;
  // What the arrow keys walk: each tickable heading, then its options.
  const navItems = useMemo(
    () =>
      filteredGroups.flatMap((group) => [
        ...(tickableHeadings && group.label ? [{ group, option: null }] : []),
        ...group.options.map((option) => ({ group, option })),
      ]),
    [filteredGroups, tickableHeadings]
  );
  // A heading acts on its whole group, not only the options the search left.
  const fullGroup = (group: MultiSelectGroup<Id>) =>
    normalizedGroups.find((candidate) => candidate.label === group.label) ?? group;
  function activate(item: { group: MultiSelectGroup<Id>; option: MultiSelectOption<Id> | null }) {
    if (item.option) onToggle(item.option.id);
    else onToggleGroup?.(fullGroup(item.group));
  }

  useEffect(() => {
    if (highlight === null) return;
    document.getElementById(`${listId}-${highlight}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight, listId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setHighlight(null);
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setHighlight(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, navItems.length));
    } else if (event.key === 'Enter' && highlight !== null && navItems[highlight]) {
      event.preventDefault();
      activate(navItems[highlight]);
    }
  }

  let flatIndex = -1;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* Field chrome, never a `Button`: a multi-pick opens a list to pick
          from, the same intent as a `Select` (DESIGN.md §6c). */}
      <PopoverTrigger
        aria-label={
          triggerAriaLabel ??
          (triggerLabel !== undefined && triggerLabel !== label
            ? t('common.checkboxSelect.labelled', { label, value: triggerLabel })
            : undefined)
        }
        className={cx(selectTriggerClassName(size), className)}
      >
        <span>
          {triggerLabel ?? label}
          {summary !== undefined && (
            <span className="ml-2 text-text-dim tabular-nums">{summary}</span>
          )}
        </span>
        <SelectChevron size={size} />
      </PopoverTrigger>
      <PopoverContent aria-label={label} className={cx('w-64 p-0', contentClassName)}>
        {typeof extraContent === 'function' ? extraContent(() => setOpen(false)) : extraContent}
        <div className="p-1">
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              highlight === null || !navItems[highlight] ? undefined : `${listId}-${highlight}`
            }
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="max-h-64 overflow-y-auto p-1"
        >
          {!hasResults && (
            <p aria-hidden="true" className="px-2 py-1.5 text-sm text-text-dim">
              {noResultsLabel}
            </p>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label}>
              {group.label &&
                (tickableHeadings ? (
                  (() => {
                    const index = ++flatIndex;
                    const state = groupState?.(fullGroup(group)) ?? false;
                    return (
                      <div
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={state === true}
                        aria-checked={state === 'mixed' ? 'mixed' : undefined}
                        className={cx(
                          menuItemClassName,
                          eyebrowClassName,
                          index === highlight && `bg-panel-2 ${activeOptionClassName}`
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onToggleGroup?.(fullGroup(group))}
                      >
                        <span aria-hidden="true" className="inline-block w-3 text-center">
                          {state === 'mixed' ? '–' : state ? '✓' : ''}
                        </span>
                        {group.label}
                      </div>
                    );
                  })()
                ) : (
                  <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{group.label}</p>
                ))}
              {group.options.map((option) => {
                const checked = selected.has(option.id);
                const index = ++flatIndex;
                return (
                  <div
                    key={String(option.id)}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={checked}
                    className={cx(
                      menuItemClassName,
                      tickableHeadings && group.label && 'pl-5',
                      index === highlight && `bg-panel-2 ${activeOptionClassName}`
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onToggle(option.id)}
                  >
                    <span aria-hidden="true" className="inline-block w-3 text-center">
                      {checked ? '✓' : ''}
                    </span>
                    {option.swatch}
                    {option.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <LiveStatus>{!hasResults && noResultsLabel}</LiveStatus>
      </PopoverContent>
    </Popover>
  );
}

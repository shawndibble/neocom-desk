import { eyebrowClassName } from './eyebrowClassName';
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
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
  triggerLabel?: string;
  summary?: ReactNode;
  triggerAriaLabel?: string;
  size?: ControlSize;
  className?: string;
  active?: boolean;
  options?: readonly MultiSelectOption<Id>[];
  groups?: readonly MultiSelectGroup<Id>[];
  selected: ReadonlySet<Id>;
  onToggle: (id: Id) => void;
  label: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  extraContent?: ReactNode | ((close: () => void) => ReactNode);
  contentClassName?: string;
  groupState?: (group: MultiSelectGroup<Id>) => boolean | 'mixed';
  onToggleGroup?: (group: MultiSelectGroup<Id>) => void;
}

export function MultiSelect<Id>({
  triggerLabel,
  summary,
  triggerAriaLabel,
  size = 'md',
  className,
  active,
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
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
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
  const navItems = useMemo(
    () =>
      filteredGroups.flatMap((group) => [
        ...(tickableHeadings && group.label ? [{ group, option: null }] : []),
        ...group.options.map((option) => ({ group, option })),
      ]),
    [filteredGroups, tickableHeadings]
  );
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
      <PopoverTrigger
        aria-label={
          triggerAriaLabel ??
          (triggerLabel !== undefined && triggerLabel !== label
            ? t('common.checkboxSelect.labelled', { label, value: triggerLabel })
            : undefined)
        }
        className={cx(selectTriggerClassName(size), className)}
        data-active={active || undefined}
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
            autoFocus={!coarse}
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

import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { fieldBaseClassName, fieldSizeClassName } from './controlStyles';
import { useFilterSurface } from './filterSurface';
import * as Icon from './icons';

export interface CheckboxSelectOption<V> {
  value: V;
  label: string;
  /** A dim second line under the label, for an option whose name needs explaining. */
  description?: string;
}

export interface CheckboxSelectProps<V> {
  /** The field's name: it leads the trigger's accessible name, and its visible text in an inline filter row (where `FilterField` draws no caption). */
  label: string;
  options: readonly CheckboxSelectOption<V>[];
  selected: ReadonlySet<V>;
  onToggle: (value: V) => void;
  className?: string;
}

/**
 * A select-shaped trigger over a short, closed set of checkboxes — the filter
 * rows' replacement for a line of `FilterChip`s, which wrapped across several
 * lines once a bar held three or four such groups.
 *
 * A `DropdownMenu`, not `MultiSelect`: a handful of fixed options needs no
 * search box. Toggling keeps the menu open, so picking several is one trip.
 *
 * The trigger summarises the selection in words — "All", "None", the one
 * option's name, or a count — so a narrowed filter reads as narrowed without
 * relying on colour.
 */
export function CheckboxSelect<V extends string | number>({
  label,
  options,
  selected,
  onToggle,
  className,
}: CheckboxSelectProps<V>) {
  const { t } = useTranslation();
  const inline = useFilterSurface() === 'inline';
  // Named with the summary too, so a screen reader hears "Source: 2 selected",
  // not just "Source" — the narrowing must not be visual-only.
  const chosen = options.filter((option) => selected.has(option.value));
  const summary =
    chosen.length === options.length
      ? t('common.checkboxSelect.all')
      : chosen.length === 0
        ? t('common.checkboxSelect.none')
        : chosen.length === 1
          ? chosen[0].label
          : t('common.checkboxSelect.count', { count: chosen.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('common.checkboxSelect.labelled', { label, value: summary })}
        className={cx(
          fieldBaseClassName,
          fieldSizeClassName.sm,
          'flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap',
          className
        )}
      >
        <span className="min-w-0 truncate">
          {inline ? t('common.checkboxSelect.labelled', { label, value: summary }) : summary}
        </span>
        <Icon.Expanded
          aria-hidden="true"
          size={Icon.ICON_SIZE.sm}
          className="shrink-0 text-text-dim"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            // Keep the menu open across toggles (`CalendarKindFilterMenu`'s precedent).
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(option.value)}
          >
            <span className="flex flex-col">
              <span>{option.label}</span>
              {option.description && (
                <span className="text-[0.6875rem] text-text-dim">{option.description}</span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

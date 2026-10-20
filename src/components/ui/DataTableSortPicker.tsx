import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { controlHeightClassName, fieldBaseClassName, type ControlSize } from './controlStyles';
import * as Icon from './icons';
import type { DataTableColumn, DataTableSort } from './DataTable';

const SORT_ARROW = { asc: '↑', desc: '↓' } as const;

/** `<select>` value for a sort; split on the *last* `:` so a column id may contain one. */
function sortOptionValue(sort: DataTableSort): string {
  return `${sort.columnId}:${sort.direction}`;
}

function parseSortOptionValue(value: string): DataTableSort | null {
  const at = value.lastIndexOf(':');
  if (at < 0) return null;
  const direction = value.slice(at + 1);
  if (direction !== 'asc' && direction !== 'desc') return null;
  return { columnId: value.slice(0, at), direction };
}

interface DataTableSortPickerProps<T> {
  /** The columns offered; only those with a `sortValue` are listed. */
  columns: readonly DataTableColumn<T>[];
  /** The sort in force, or `undefined` before any. */
  sort: DataTableSort | undefined;
  onSortChange: (sort: DataTableSort) => void;
  /**
   * `md` (the default) is the 44px touch target of the bar above a table;
   * `sm` matches the `size="sm"` buttons of a filter row it sits in.
   */
  size?: ControlSize;
  className?: string;
}

/**
 * The phone sort picker `mobileSort` puts above a stacked table, on its own
 * for a page that wants it elsewhere (Mining Tax keeps it in its filter row,
 * so the Open list starts with its first row).
 *
 * A real `<select>` laid invisibly over its own label rather than
 * `Select`/`NativeSelect`: a phone should get the OS picker, and the closed
 * control reads "Sort: Price ↑" while each option is just "Price ↑" — a
 * native select can only show its option's text.
 */
export function DataTableSortPicker<T>({
  columns,
  sort,
  onSortChange,
  size = 'md',
  className,
}: DataTableSortPickerProps<T>) {
  const { t } = useTranslation();
  const sortable = columns.filter((column) => column.sortValue !== undefined);
  const sortColumn = sort ? sortable.find((column) => column.id === sort.columnId) : undefined;
  return (
    <label
      className={cx(
        fieldBaseClassName,
        controlHeightClassName[size],
        size === 'sm' ? 'px-2' : 'px-3',
        'relative inline-flex shrink-0 items-center gap-1.5 text-xs focus-within:outline-2 focus-within:outline-accent',
        className
      )}
    >
      <Icon.Sort aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-dim" />
      <span aria-hidden="true">
        {sortColumn && sort
          ? t('common.dataTable.sortLabel', {
              column: sortColumn.header,
              arrow: SORT_ARROW[sort.direction],
            })
          : t('common.dataTable.sortNone')}
      </span>
      <select
        aria-label={t('common.dataTable.sortBy')}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={sortColumn && sort ? sortOptionValue(sort) : ''}
        onChange={(event) => {
          const next = parseSortOptionValue(event.target.value);
          if (next) onSortChange(next);
        }}
      >
        {/* Matches `value=""` before any sort; never re-selectable. */}
        <option value="" disabled>
          {t('common.dataTable.sortNone')}
        </option>
        {sortable.flatMap((column) =>
          (['asc', 'desc'] as const).map((direction) => (
            <option
              key={`${column.id}:${direction}`}
              value={sortOptionValue({ columnId: column.id, direction })}
            >
              {t('common.dataTable.sortOption', {
                column: column.header,
                arrow: SORT_ARROW[direction],
              })}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { controlHeightClassName, fieldBaseClassName, type ControlSize } from './controlStyles';
import * as Icon from './icons';
import { iconButtonClassName } from './iconButtonClassName';
import { firstSortDirection } from './dataTableSort';
import type { DataTableColumn, DataTableSort } from './DataTable';

const SORT_ARROW = { asc: '↑', desc: '↓' } as const;

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
  columns: readonly DataTableColumn<T>[];
  sort: DataTableSort | undefined;
  onSortChange: (sort: DataTableSort) => void;
  rows: readonly T[];
  size?: ControlSize;
  iconOnly?: boolean;
  className?: string;
}

export function DataTableSortPicker<T>({
  columns,
  sort,
  onSortChange,
  rows,
  size = 'md',
  iconOnly = false,
  className,
}: DataTableSortPickerProps<T>) {
  const { t } = useTranslation();
  const sortable = columns.filter((column) => column.sortValue !== undefined);
  const sortColumn = sort ? sortable.find((column) => column.id === sort.columnId) : undefined;
  const currentLabel =
    sortColumn && sort
      ? t('common.dataTable.sortLabel', {
          column: sortColumn.header,
          arrow: SORT_ARROW[sort.direction],
        })
      : t('common.dataTable.sortNone');
  return (
    <label
      className={cx(
        iconOnly
          ? iconButtonClassName({
              className: 'relative focus-within:outline-2 focus-within:outline-accent',
            })
          : cx(
              fieldBaseClassName,
              controlHeightClassName[size],
              size === 'sm' ? 'px-2' : 'px-3',
              'relative inline-flex shrink-0 items-center gap-1.5 text-xs focus-within:outline-2 focus-within:outline-accent'
            ),
        className
      )}
    >
      {iconOnly ? (
        <Icon.Sort aria-hidden="true" size={Icon.ICON_SIZE.md} />
      ) : (
        <>
          <Icon.Sort aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-dim" />
          <span aria-hidden="true">{currentLabel}</span>
        </>
      )}
      <select
        aria-label={
          iconOnly
            ? sortColumn && sort
              ? t('common.dataTable.sortByCurrent', {
                  current: t('common.dataTable.sortOption', {
                    column: sortColumn.header,
                    arrow: SORT_ARROW[sort.direction],
                  }),
                })
              : t('common.dataTable.sortBy')
            : t('common.dataTable.sortBy')
        }
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={sortColumn && sort ? sortOptionValue(sort) : ''}
        onChange={(event) => {
          const next = parseSortOptionValue(event.target.value);
          if (next) onSortChange(next);
        }}
      >
        <option value="" disabled>
          {t('common.dataTable.sortNone')}
        </option>
        {sortable.flatMap((column) =>
          (firstSortDirection(column, rows) === 'desc'
            ? (['desc', 'asc'] as const)
            : (['asc', 'desc'] as const)
          ).map((direction) => (
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

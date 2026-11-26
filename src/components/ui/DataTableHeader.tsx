import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from './controlStyles';
import * as Icon from './icons';
import { InfoTooltip } from './Tooltip';
import { stickyStartClass } from './dataTableSticky';
import {
  columnCellWidth,
  TRAILING_COL_ACTIONS_REM,
  TRAILING_COL_EXPAND_REM,
} from './dataTableWidths';
import type { DataTableColumn, DataTableSort } from './DataTable';

interface Props<T> {
  columns: readonly DataTableColumn<T>[];
  headerTextClass: string[];
  sort: DataTableSort | null;
  density: 'default' | 'compact';
  isStacked: boolean;
  fixedLayout: boolean;
  expandable: boolean;
  rowMoreActions: boolean;
  onToggleSort: (column: DataTableColumn<T>) => void;
  floating?: boolean;
}

export function DataTableHeader<T>({
  columns,
  headerTextClass,
  sort,
  density,
  isStacked,
  fixedLayout,
  expandable,
  rowMoreActions,
  onToggleSort,
  floating = false,
}: Props<T>): ReactNode {
  const { t } = useTranslation();
  return (
    <thead role={floating ? undefined : 'rowgroup'}>
      <tr role="row" className="border-b border-line text-left text-text-dim">
        {columns.map((column, i) => {
          const sortable = column.sortValue !== undefined;
          const active = sortable && sort?.columnId === column.id;
          const direction = active ? sort.direction : undefined;
          const SortGlyph = !active
            ? Icon.Sort
            : direction === 'asc'
              ? Icon.Ascending
              : Icon.Descending;
          const info = column.headerTooltip && !floating && (
            <InfoTooltip
              label={t('common.aboutLabel', { label: column.header })}
              content={column.headerTooltip}
              className={cx('normal-case', sortable && (density === 'compact' ? 'mr-2' : 'mr-3'))}
            />
          );
          return (
            <th
              key={column.id}
              role="columnheader"
              scope="col"
              style={
                fixedLayout && column.width
                  ? { width: columnCellWidth(column.width, density) }
                  : undefined
              }
              className={cx(
                sortable ? 'p-0' : headerTextClass[i],
                column.stickyStart && stickyStartClass(column),
                column.phoneHidden && !isStacked && 'max-sm:hidden',
                column.headerCellClassName
              )}
              aria-sort={
                sortable
                  ? active
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined
              }
            >
              {sortable ? (
                <span
                  className={cx('flex items-center', column.align === 'center' && 'justify-center')}
                >
                  <button
                    type="button"
                    tabIndex={floating ? -1 : undefined}
                    onClick={() => onToggleSort(column)}
                    className={cx(
                      headerTextClass[i],
                      'inline-flex items-center gap-1 hover:text-text active:text-text-dim',
                      interactiveClassName,
                      focusRingInsetClassName,
                      column.align === 'right' && 'flex-1 justify-end'
                    )}
                  >
                    {column.header}
                    <SortGlyph
                      aria-hidden="true"
                      size={Icon.ICON_SIZE.sm}
                      className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
                    />
                  </button>
                  {info}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {info}
                </span>
              )}
            </th>
          );
        })}
        {expandable && (
          <th
            role="columnheader"
            scope="col"
            aria-hidden="true"
            style={fixedLayout ? { width: `${TRAILING_COL_EXPAND_REM}rem` } : undefined}
            className={cx('p-0', !fixedLayout && 'w-0')}
          />
        )}
        {rowMoreActions && (
          <th
            role="columnheader"
            scope="col"
            style={{ width: `${TRAILING_COL_ACTIONS_REM}rem` }}
            className="relative p-0"
          >
            <span className="sr-only">{t('common.dataTable.actionsHeader')}</span>
          </th>
        )}
      </tr>
    </thead>
  );
}

import { RowCaret, type DataTableColumn } from '@/components/ui';

/**
 * The trailing caret of a row that navigates. `hasMenu` names the rows that end in a ⋮ instead:
 * a caret beside a ⋮ is redundant (DESIGN.md §6c), so those rows leave the cell empty.
 */
export function caretColumn<T>(hasMenu?: (row: T) => boolean): DataTableColumn<T> {
  return {
    id: 'go',
    header: '',
    align: 'right',
    className: 'w-6 max-sm:hidden',
    render: (row) => (hasMenu?.(row) ? null : <RowCaret />),
  };
}

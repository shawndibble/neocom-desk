import { RowCaret, type DataTableColumn } from '@/components/ui';

export function caretColumn<T>(hasMenu?: (row: T) => boolean): DataTableColumn<T> {
  return {
    id: 'go',
    header: '',
    align: 'right',
    className: 'w-6 max-sm:hidden',
    render: (row) => (hasMenu?.(row) ? null : <RowCaret />),
  };
}

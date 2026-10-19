import { RowCaret, type DataTableColumn } from '@/components/ui';

export function caretColumn<T>(): DataTableColumn<T> {
  return {
    id: 'go',
    header: '',
    align: 'right',
    className: 'w-6 max-sm:hidden',
    render: () => <RowCaret />,
  };
}

import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  name: string;
  quantity: number;
}

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Item', render: (r) => r.name, sortValue: (r) => r.name },
  {
    id: 'quantity',
    header: 'Quantity',
    align: 'right',
    render: (r) => r.quantity.toLocaleString('en'),
    sortValue: (r) => r.quantity,
  },
];

const rows: Row[] = [
  { name: 'Tritanium', quantity: 120000 },
  { name: 'Pyerite', quantity: 45000 },
  { name: 'Mexallon', quantity: 8200 },
];

const meta = {
  title: 'ui/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  args: { columns, rows, rowKey: (r: Row) => r.name, label: 'Materials' },
} satisfies Meta<typeof DataTable<Row>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Rows with sortable columns. */
export const Sortable: Story = {};

/** @summary Opens already sorted by quantity, largest first. */
export const DefaultSorted: Story = {
  args: { defaultSort: { columnId: 'quantity', direction: 'desc' } },
};

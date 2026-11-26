import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, DataTableSortPicker, type DataTableColumn } from './DataTable';

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

export const Sortable: Story = {};

export const DefaultSorted: Story = {
  args: { defaultSort: { columnId: 'quantity', direction: 'desc' } },
};

const groupedRows: Row[] = [
  { name: 'Tritanium', quantity: 120000 },
  { name: 'Tritanium', quantity: 3000 },
  { name: 'Pyerite', quantity: 45000 },
  { name: 'Mexallon', quantity: 8200 },
  { name: 'Mexallon', quantity: 700 },
  { name: 'Mexallon', quantity: 50 },
];

export const GroupsOrderedByCompare: Story = {
  args: {
    rows: groupedRows,
    rowKey: (r: unknown) => `${(r as Row).name}:${(r as Row).quantity}`,
    defaultSort: { columnId: 'quantity', direction: 'desc' },
    groupBy: {
      key: (r: unknown) => (r as Row).name,
      renderHeader: (group: readonly unknown[]) =>
        `${(group[0] as Row | undefined)?.name} · ${group.length} rows`,
      defaultExpanded: () => true,
      allWidths: true,
      minSize: 1,
      groupCompare: (a: readonly unknown[], b: readonly unknown[]) => b.length - a.length,
    },
  },
};

const denseColumns = [
  { id: 'name', header: 'Item', render: (r: Row) => r.name, primary: true },
  {
    id: 'quantity',
    header: 'Quantity',
    render: (r: Row) => r.quantity.toLocaleString('en'),
    cardCorner: true,
  },
] as DataTableColumn<Row>[] as unknown as DataTableColumn<unknown>[];

const phone = { globals: { viewport: { value: 'phone390', isRotated: false } } } as const;

export const Compact: Story = { args: { density: 'compact' } };

export const PhoneCards: Story = {
  args: { stacked: true, mobileSort: true, stackSummary: '3 materials' },
  ...phone,
};

export const SortPickerIconOnly: Story = {
  render: () => (
    <DataTableSortPicker
      iconOnly
      columns={columns}
      rows={rows}
      sort={{ columnId: 'quantity', direction: 'desc' }}
      onSortChange={() => {}}
    />
  ),
  ...phone,
};

export const PhoneCardsTwoColumns: Story = {
  args: { stacked: true, stackColumns: 2 },
  ...phone,
};

export const PhoneDenseCards: Story = {
  args: {
    stacked: true,
    stackLayout: 'dense',
    columns: denseColumns,
  },
  ...phone,
};

export const PhoneCardsExpandable: Story = {
  args: {
    stacked: true,
    expandableRow: {
      leadingIcon: true,
      initialKey: 'Pyerite',
      renderDetail: (r: unknown) => {
        const { name, quantity } = r as Row;
        return `${name}: ${quantity.toLocaleString('en')} units in stock.`;
      },
    },
  },
  ...phone,
};

export const TableOnPhone: Story = { args: { responsive: 'table' }, ...phone };

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

/** @summary Tighter rows for a long list. */
export const Compact: Story = { args: { density: 'compact' } };

/**
 * Below `sm` each row becomes a labelled card. `stacked` forces the cards at
 * any width so the story reads the same everywhere; real tables just follow
 * the viewport.
 *
 * @summary Phone cards: one labelled field per line, with a phone sort picker.
 */
export const PhoneCards: Story = {
  args: { stacked: true, mobileSort: true, stackSummary: '3 materials' },
  ...phone,
};

/** @summary Phone cards with two short figures side by side, label above the value. */
export const PhoneCardsTwoColumns: Story = {
  args: { stacked: true, stackColumns: 2 },
  ...phone,
};

/**
 * For a long list read by scanning: title and `cardCorner` figure on line one,
 * the rest inline and unlabelled on line two, so a phone shows three times the
 * rows. `stackAffix` supplies the words the dropped headers carried.
 *
 * @summary Phone dense cards: two-line rows for scanning a long list.
 */
export const PhoneDenseCards: Story = {
  args: {
    stacked: true,
    stackLayout: 'dense',
    columns: denseColumns,
  },
  ...phone,
};

/** @summary Keeps real columns on a phone and scrolls sideways; right when comparing across columns is the point. */
export const TableOnPhone: Story = { args: { responsive: 'table' }, ...phone };

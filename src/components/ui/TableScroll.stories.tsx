import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, type DataTableColumn } from './DataTable';
import { TableScroll } from './TableScroll';

interface Row {
  name: string;
  quantity: number;
}

const rows: Row[] = [
  { name: 'Tritanium', quantity: 120000 },
  { name: 'Pyerite', quantity: 45000 },
  { name: 'Mexallon', quantity: 8200 },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Item', render: (r) => r.name, stickyStart: true },
  {
    id: 'quantity',
    header: 'Quantity',
    align: 'right',
    render: (r) => r.quantity.toLocaleString('en'),
  },
  { id: 'unit', header: 'Unit price', align: 'right', render: () => '4.12 ISK' },
  {
    id: 'total',
    header: 'Total value',
    align: 'right',
    render: (r) => `${(r.quantity * 4.12).toLocaleString('en')} ISK`,
  },
  { id: 'hub', header: 'Trade hub', render: () => 'Jita IV - Moon 4' },
];

const table = (
  <DataTable
    columns={columns}
    rows={rows}
    rowKey={(r) => r.name}
    label="Materials"
    responsive="table"
  />
);

/** @summary The sideways scroller around a table: a right-edge band shows while columns lie past the edge. */
const meta = {
  title: 'ui/TableScroll',
  component: TableScroll,
  tags: ['autodocs'],
  args: { children: table },
} satisfies Meta<typeof TableScroll>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Wider than its frame: the band sits on the right edge until the last column is reached. */
export const Overflowing: Story = {
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

/** @summary The table fits, so there is no band. */
export const Fits: Story = {};

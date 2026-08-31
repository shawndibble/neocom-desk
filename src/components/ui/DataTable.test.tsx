import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: number;
  item: string;
  amount: number;
  expired: boolean;
}

const rows: Row[] = [
  { id: 1, item: 'Tritanium', amount: 250, expired: false },
  { id: 2, item: 'Pyerite', amount: -80, expired: true },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'item', header: 'Item', render: (row) => row.item },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (row) => (row.amount < 0 ? 'text-isk-neg' : 'text-isk-pos'),
    render: (row) => row.amount.toFixed(2),
  },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(
    <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} label="Journal" {...props} />
  );
}

describe('DataTable', () => {
  it('exposes an accessible name and column headers', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Journal' })).toBeInTheDocument();
    for (const name of ['Item', 'Amount']) {
      expect(screen.getByRole('columnheader', { name })).toHaveAttribute('scope', 'col');
    }
  });

  it('renders one body row per item with the rendered cell content', () => {
    renderTable();
    // Header row plus one row per item.
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1);
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Tritanium');
    expect(cells[1]).toHaveTextContent('250.00');
    expect(cells[2]).toHaveTextContent('Pyerite');
    expect(cells[3]).toHaveTextContent('-80.00');
  });

  it('right-aligns both the header and the cells of a right-aligned column', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveClass('text-right');
    expect(screen.getByRole('columnheader', { name: 'Item' })).not.toHaveClass('text-right');
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveClass('text-right', 'tabular-nums');
    expect(cells[0]).not.toHaveClass('text-right');
  });

  it('applies cellClassName per row', () => {
    renderTable();
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveClass('text-isk-pos');
    expect(cells[3]).toHaveClass('text-isk-neg');
  });

  it('applies rowClassName per row', () => {
    renderTable({ rowClassName: (row) => (row.expired ? 'opacity-50' : undefined) });
    const [, first, second] = screen.getAllByRole('row');
    expect(first).not.toHaveClass('opacity-50');
    expect(second).toHaveClass('opacity-50');
    // Hover fill from docs/DESIGN.md §4 survives a rowClassName.
    expect(second).toHaveClass('hover:bg-panel-2');
  });

  it('renders a header-only table when there are no rows', () => {
    renderTable({ rows: [] });
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.queryAllByRole('cell')).toHaveLength(0);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

interface SortRow {
  id: number;
  name: string;
  value: number | undefined;
}

const sortRows: SortRow[] = [
  { id: 1, name: 'Charlie', value: 30 },
  { id: 2, name: 'Alpha', value: undefined },
  { id: 3, name: 'Bravo', value: 10 },
  { id: 4, name: 'Delta', value: 20 },
];

const sortColumns: DataTableColumn<SortRow>[] = [
  { id: 'name', header: 'Name', render: (row) => row.name },
  {
    id: 'value',
    header: 'Value',
    align: 'right',
    sortValue: (row) => row.value,
    render: (row) => (row.value === undefined ? '—' : String(row.value)),
  },
];

function itemNames() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
}

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

  describe('sorting', () => {
    function renderSortable(props: Partial<Parameters<typeof DataTable<SortRow>>[0]> = {}) {
      return render(
        <DataTable
          columns={sortColumns}
          rows={sortRows}
          rowKey={(row) => row.id}
          label="Sortable"
          {...props}
        />
      );
    }

    it('leaves a column with no sortValue inert', () => {
      renderSortable();
      expect(screen.queryByRole('button', { name: 'Name' })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort');
    });

    it('sorts ascending on first click and descending on second, and exposes it to assistive tech', async () => {
      const user = userEvent.setup();
      renderSortable();
      const header = screen.getByRole('columnheader', { name: 'Value' });
      expect(header).toHaveAttribute('aria-sort', 'none');

      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(header).toHaveAttribute('aria-sort', 'ascending');
      expect(itemNames()).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);

      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(header).toHaveAttribute('aria-sort', 'descending');
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);
    });

    it('sinks rows with a missing sort value to the end in both directions', async () => {
      const user = userEvent.setup();
      renderSortable();
      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(itemNames().at(-1)).toBe('Alpha');
      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(itemNames().at(-1)).toBe('Alpha');
    });

    it('honours a declared default sort without a click', () => {
      renderSortable({ defaultSort: { columnId: 'value', direction: 'desc' } });
      expect(screen.getByRole('columnheader', { name: 'Value' })).toHaveAttribute(
        'aria-sort',
        'descending'
      );
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);
    });

    it('leaves every existing (non-opted-in) table unsorted and in original row order', () => {
      renderTable();
      const cells = screen.getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Tritanium');
      expect(cells[2]).toHaveTextContent('Pyerite');
    });
  });
});

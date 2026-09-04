import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ContextMenu';

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

  it("applies headerClassName to a non-sortable column's header, without touching its cells", () => {
    renderTable({
      columns: [{ ...columns[0], headerClassName: 'whitespace-nowrap' }, columns[1]],
    });
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveClass('whitespace-nowrap');
    expect(screen.getAllByRole('cell')[0]).not.toHaveClass('whitespace-nowrap');
  });

  it("applies headerClassName to a sortable column's header button (ISK / LP shouldn't wrap when its column is squeezed)", () => {
    render(
      <DataTable
        columns={[sortColumns[0], { ...sortColumns[1], headerClassName: 'whitespace-nowrap' }]}
        rows={sortRows}
        rowKey={(row) => row.id}
        label="Sortable"
      />
    );
    expect(screen.getByRole('button', { name: 'Value' })).toHaveClass('whitespace-nowrap');
  });

  it('defaults to comfortable header and cell padding', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveClass('px-3', 'py-2');
    expect(screen.getAllByRole('cell')[0]).toHaveClass('px-3', 'py-1.5');
  });

  it('tightens header and cell padding when density is compact', () => {
    renderTable({ density: 'compact' });
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveClass('px-2', 'py-1');
    expect(screen.getAllByRole('cell')[0]).toHaveClass('px-2', 'py-1');
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

    it('keeps the original relative order of rows that tie on sort value', async () => {
      const user = userEvent.setup();
      render(
        <DataTable
          columns={sortColumns}
          rows={[
            { id: 1, name: 'First', value: 10 },
            { id: 2, name: 'Second', value: 10 },
          ]}
          rowKey={(row) => row.id}
          label="Sortable"
        />
      );
      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(itemNames()).toEqual(['First', 'Second']);
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

  describe('rowContextMenu', () => {
    it('wraps each row without breaking the table structure', () => {
      renderTable({
        rowContextMenu: (row, tr) => (
          <ContextMenu key={row.id}>
            <ContextMenuTrigger asChild>{tr}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Copy {row.item}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ),
      });
      expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1);
      expect(screen.getAllByRole('cell')[0]).toHaveTextContent('Tritanium');
    });

    it('gives a focusable row a visible focus ring (DESIGN.md §6, never outline-none without a replacement)', () => {
      renderTable({
        rowContextMenu: (row, tr) => (
          <ContextMenu key={row.id}>
            <ContextMenuTrigger asChild>{tr}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Copy {row.item}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ),
      });
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).toHaveClass('focus-visible:outline-accent');
    });

    it('makes rows focusable so a keyboard user can open the menu without a mouse', async () => {
      const user = userEvent.setup();
      renderTable({
        rowContextMenu: (row, tr) => (
          <ContextMenu key={row.id}>
            <ContextMenuTrigger asChild>{tr}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Copy {row.item}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ),
      });
      const [, firstRow] = screen.getAllByRole('row');
      firstRow.focus();
      fireEvent.contextMenu(firstRow);
      expect(await screen.findByRole('menuitem', { name: 'Copy Tritanium' })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(firstRow).toHaveFocus();
    });

    it('leaves rows non-focusable when no context menu is wired up', () => {
      renderTable();
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).not.toHaveAttribute('tabindex');
    });
  });

  describe('onRowClick', () => {
    it('calls back with the row on click, anywhere in the row', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      renderTable({ onRowClick });
      const cells = screen.getAllByRole('cell');
      await user.click(cells[1]); // the Amount cell, not just the first column
      expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it('makes rows focusable and responds to Enter, same focus treatment as rowContextMenu', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      renderTable({ onRowClick });
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).toHaveClass('focus-visible:outline-accent');

      firstRow.focus();
      await user.keyboard('{Enter}');
      expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    });

    it('leaves rows non-focusable when no row click handler is wired up', () => {
      renderTable();
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).not.toHaveAttribute('tabindex');
    });
  });

  // The collapse itself is CSS (`.dt-stack`, src/styles/index.css) and jsdom
  // loads no stylesheet, so these cover the markup that CSS depends on: where
  // the labels come from, the opt-out hook, and the roles `display: block`
  // would otherwise strip in a real browser.
  describe('responsive collapse', () => {
    it('carries each column header on its cells, for the stacked layout to print', () => {
      renderTable();
      const [itemCell, amountCell] = screen.getAllByRole('cell');
      expect(itemCell).toHaveAttribute('data-label', 'Item');
      expect(amountCell).toHaveAttribute('data-label', 'Amount');
    });

    it('stacks by default and opts out on request', () => {
      const { unmount } = renderTable();
      expect(screen.getByRole('table')).toHaveClass('dt-stack');

      unmount();
      renderTable({ responsive: 'table' });
      expect(screen.getByRole('table')).not.toHaveClass('dt-stack');
    });

    it('states its table roles explicitly, since the stacked layout drops the implicit ones', () => {
      renderTable();
      expect(screen.getByRole('table')).toHaveAttribute('role', 'table');
      expect(screen.getAllByRole('row')[0]).toHaveAttribute('role', 'row');
      expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('role', 'columnheader');
      expect(screen.getAllByRole('cell')[0]).toHaveAttribute('role', 'cell');
      expect(screen.getAllByRole('rowgroup')).toHaveLength(2);
    });

    it('titles the card with the first column by default', () => {
      renderTable();
      const [itemCell, amountCell] = screen.getAllByRole('cell');
      expect(itemCell).toHaveClass('dt-primary');
      expect(amountCell).not.toHaveClass('dt-primary');
    });

    it('lets a later column claim the title without moving in the table', () => {
      renderTable({
        columns: [columns[0], { ...columns[1], primary: true }],
      });
      const [itemCell, amountCell] = screen.getAllByRole('cell');
      expect(amountCell).toHaveClass('dt-primary');
      expect(itemCell).not.toHaveClass('dt-primary');
      // Still the second cell: the hoist is CSS `order`, not a DOM reorder,
      // so the table's own reading order survives at every width.
      expect(amountCell).toHaveAttribute('data-label', 'Amount');
    });
  });
});

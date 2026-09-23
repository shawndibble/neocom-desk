import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { DataTable, type DataTableColumn, type DataTableGroupBy } from './DataTable';
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

describe('DataTable highlightRowKey', () => {
  it('pulses only the named row and scrolls it into view', () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    renderTable({ highlightRowKey: 2 });

    const pulsed = document.querySelector('[data-row-key="2"]');
    expect(pulsed?.className).toContain('row-pulse');
    expect(document.querySelector('[data-row-key="1"]')?.className).not.toContain('row-pulse');
    expect(scrollIntoView.mock.instances).toContain(pulsed);
    scrollIntoView.mockRestore();
  });

  it('does nothing for a key matching no row — a link that outlived its data', () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    renderTable({ highlightRowKey: 999 });

    expect(document.querySelector('.row-pulse')).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    scrollIntoView.mockRestore();
  });

  it('pulses nothing at all when no row was named', () => {
    renderTable();
    expect(document.querySelector('.row-pulse')).toBeNull();
  });

  it('scrolls once the row arrives, not only when the key does', () => {
    // The key is in the URL before the fetch resolves, so an effect keyed on
    // the id alone would fire against an empty table and never run again.
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row: Row) => row.id}
        label="Journal"
        highlightRowKey={2}
      />
    );
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row: Row) => row.id}
        label="Journal"
        highlightRowKey={2}
      />
    );
    expect(scrollIntoView.mock.instances).toContain(document.querySelector('[data-row-key="2"]'));
    scrollIntoView.mockRestore();
  });
});

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

  it('centers both the header and the cells of a centered column', () => {
    renderTable({
      columns: [columns[0], { ...columns[1], align: 'center' }],
    });
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveClass('text-center');
    expect(screen.getByRole('columnheader', { name: 'Item' })).not.toHaveClass('text-center');
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveClass('text-center');
    expect(cells[0]).not.toHaveClass('text-center');
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

    it('renders a controlled sort and reports clicks without sorting itself', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      const { rerender } = renderSortable({
        sort: { columnId: 'value', direction: 'desc' },
        onSortChange,
        // Inert once controlled.
        defaultSort: { columnId: 'name', direction: 'asc' },
      });
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);

      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(onSortChange).toHaveBeenCalledWith({ columnId: 'value', direction: 'asc' });
      // Nothing moved: the parent owns the sort and has not changed it.
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);

      rerender(
        <DataTable
          columns={sortColumns}
          rows={sortRows}
          rowKey={(row) => row.id}
          label="Sortable"
          sort={{ columnId: 'value', direction: 'asc' }}
          onSortChange={onSortChange}
        />
      );
      expect(itemNames()).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
    });

    it('still reports sort changes from an uncontrolled table that asks for them', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      renderSortable({ onSortChange });
      await user.click(screen.getByRole('button', { name: 'Value' }));
      expect(onSortChange).toHaveBeenCalledWith({ columnId: 'value', direction: 'asc' });
      expect(itemNames()).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
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

describe('DataTable opt-in phone features', () => {
  it('adds nothing to a table that passes none of them', () => {
    const { container } = render(
      <DataTable columns={sortColumns} rows={sortRows} rowKey={(row) => row.id} label="Values" />
    );
    // The table is still the component's only root: no sort bar, no wrapper.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('TABLE');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const selector of [
      '[data-stack-before]',
      '[data-stack-after]',
      '.dt-meta',
      '.dt-meta-first',
      '.dt-sorted',
      '.dt-stack-dense',
      '.dt-group-header',
    ]) {
      expect(container.querySelector(selector)).toBeNull();
    }
  });

  describe('mobileSort', () => {
    it('renders a sort picker before the table, and keeps className on the table', () => {
      const { container } = render(
        <DataTable
          columns={sortColumns}
          rows={sortRows}
          rowKey={(row) => row.id}
          label="Values"
          className="mt-2"
          mobileSort
          stackSummary="4 offers"
        />
      );
      const [bar, table] = Array.from(container.children);
      expect(bar).toHaveClass('sm:hidden');
      expect(bar).toHaveTextContent('4 offers');
      expect(table?.tagName).toBe('TABLE');
      expect(table).toHaveClass('mt-2');
      const select = screen.getByRole('combobox', { name: 'Sort by' });
      // Only the sortable column, both directions (plus the unsorted placeholder).
      expect(
        Array.from((select as HTMLSelectElement).options)
          .filter((option) => !option.disabled)
          .map((option) => option.textContent)
      ).toEqual(['Value ↑', 'Value ↓']);
    });

    it('drives the same sort state the header buttons use', async () => {
      const user = userEvent.setup();
      render(
        <DataTable
          columns={sortColumns}
          rows={sortRows}
          rowKey={(row) => row.id}
          label="Values"
          mobileSort
        />
      );
      expect(screen.getByText('Sort', { selector: 'span' })).toBeInTheDocument();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'value:desc');
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);
      expect(screen.getByText('Sort: Value ↓')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Value/ })).toHaveAttribute(
        'aria-sort',
        'descending'
      );

      // …and the other way round: a header click moves the picker.
      await user.click(screen.getByRole('button', { name: /Value/ }));
      expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('value:asc');
      expect(screen.getByText('Sort: Value ↑')).toBeInTheDocument();
    });

    it('renders no picker when no column is sortable', () => {
      const { container } = renderTable({ mobileSort: true, stackSummary: '2 rows' });
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(container.children).toHaveLength(1);
    });
  });

  it('marks every cell of the active sort column dt-sorted, following the sort', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={[{ ...sortColumns[0]!, sortValue: (row) => row.name }, sortColumns[1]!]}
        rows={sortRows}
        rowKey={(row) => row.id}
        label="Values"
        defaultSort={{ columnId: 'value', direction: 'asc' }}
      />
    );
    const sortedCells = () =>
      Array.from(document.querySelectorAll('td.dt-sorted')).map((td) =>
        td.getAttribute('data-label')
      );
    expect(sortedCells()).toEqual(['Value', 'Value', 'Value', 'Value']);
    await user.click(screen.getByRole('button', { name: /Name/ }));
    expect(sortedCells()).toEqual(['Name', 'Name', 'Name', 'Name']);
  });

  describe('dense stack', () => {
    const denseColumns: DataTableColumn<Row>[] = [
      { id: 'item', header: 'Item', render: (row) => row.item },
      {
        id: 'amount',
        header: 'Amount',
        stackAffix: { before: 'Qty ' },
        render: (row) => String(row.amount),
      },
      {
        id: 'id',
        header: 'Id',
        stackAffix: { after: ' ref' },
        render: (row) => String(row.id),
      },
      { id: 'corner', header: 'ISK', cardCorner: true, render: () => '1.2M' },
    ];

    it('tags the table, the meta cells and the affixes', () => {
      renderTable({ columns: denseColumns, stackLayout: 'dense', stackColumns: 2 });
      const table = screen.getByRole('table');
      expect(table).toHaveClass('dt-stack', 'dt-stack-dense');
      // Dense replaces the 2-col card rather than stacking on it.
      expect(table).not.toHaveClass('dt-stack-2col');
      const [item, amount, id, corner] = screen.getAllByRole('cell');
      expect(item).toHaveClass('dt-primary');
      expect(item).not.toHaveClass('dt-meta');
      expect(corner).toHaveClass('dt-corner');
      expect(corner).not.toHaveClass('dt-meta');
      expect(amount).toHaveClass('dt-meta', 'dt-meta-first');
      expect(amount).toHaveAttribute('data-stack-before', 'Qty ');
      expect(amount).not.toHaveAttribute('data-stack-after');
      expect(id).toHaveClass('dt-meta');
      expect(id).not.toHaveClass('dt-meta-first');
      expect(id).toHaveAttribute('data-stack-after', ' ref');
    });

    it('is ignored when the table does not stack', () => {
      renderTable({ columns: denseColumns, stackLayout: 'dense', responsive: 'table' });
      expect(screen.getByRole('table')).not.toHaveClass('dt-stack-dense');
      expect(document.querySelector('.dt-meta')).toBeNull();
    });
  });

  describe('groupBy', () => {
    interface Offer {
      id: number;
      route: string | null;
      reward: number;
    }
    const offers: Offer[] = [
      { id: 1, route: 'Jita→Amarr', reward: 30 },
      { id: 2, route: null, reward: 20 },
      { id: 3, route: 'Jita→Amarr', reward: 10 },
      { id: 4, route: 'Dodixie→Rens', reward: 25 },
    ];
    const offerColumns: DataTableColumn<Offer>[] = [
      { id: 'id', header: 'Id', render: (row) => `offer-${row.id}` },
      {
        id: 'reward',
        header: 'Reward',
        sortValue: (row) => row.reward,
        render: (row) => row.reward,
      },
    ];
    const groupBy: DataTableGroupBy<Offer> = {
      key: (row) => row.route,
      renderHeader: (rows) => `${rows[0]?.route} ×${rows.length}`,
    };

    function renderOffers(extra: Partial<Parameters<typeof DataTable<Offer>>[0]> = {}) {
      return render(
        <DataTable
          columns={offerColumns}
          rows={offers}
          rowKey={(row) => row.id}
          label="Offers"
          groupBy={groupBy}
          {...extra}
        />
      );
    }

    function offerIds() {
      return Array.from(document.querySelectorAll('tbody tr[data-row-key]')).map((tr) =>
        tr.getAttribute('data-row-key')
      );
    }

    describe('on a phone', () => {
      let restore: () => void;
      beforeEach(() => {
        const real = window.matchMedia;
        window.matchMedia = ((media: string) =>
          ({
            media,
            matches: media === PHONE_QUERY,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
          }) as unknown as MediaQueryList) as typeof window.matchMedia;
        restore = () => {
          window.matchMedia = real;
        };
      });
      afterEach(() => restore());

      it('folds a multi-row group behind a collapsed toggle; singletons stay ordinary rows', () => {
        renderOffers();
        const toggle = screen.getByRole('button', { name: 'Jita→Amarr ×2' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle.closest('tr')).toHaveClass('dt-group-header');
        expect(toggle.closest('td')).toHaveAttribute('colspan', '2');
        expect(toggle.closest('td')).not.toHaveAttribute('data-label');
        // Group sits where its first member did; null and single-route rows ungrouped.
        expect(offerIds()).toEqual(['2', '4']);
        expect(screen.queryByRole('button', { name: /Dodixie/ })).not.toBeInTheDocument();
        expect(document.querySelector('tr[data-row-key="4"]')).not.toHaveClass('dt-group-member');
      });

      it('expands and collapses members in current sort order', async () => {
        const user = userEvent.setup();
        renderOffers({ defaultSort: { columnId: 'reward', direction: 'asc' } });
        const toggle = screen.getByRole('button', { name: 'Jita→Amarr ×2' });
        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        // Sorted asc: 3 (10), 2 (20), 4 (25), 1 (30) — group led by 3.
        expect(offerIds()).toEqual(['3', '1', '2', '4']);
        expect(document.querySelector('tr[data-row-key="3"]')).toHaveClass('dt-group-member');
        expect(document.querySelector('tr[data-row-key="1"]')).toHaveClass('dt-group-member');
        await user.click(toggle);
        expect(offerIds()).toEqual(['2', '4']);
      });

      it('seeds expansion from defaultExpanded, and one tap closes it', async () => {
        const user = userEvent.setup();
        renderOffers({ groupBy: { ...groupBy, defaultExpanded: () => true } });
        const toggle = screen.getByRole('button', { name: 'Jita→Amarr ×2' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(offerIds()).toEqual(['1', '3', '2', '4']);
        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(offerIds()).toEqual(['2', '4']);
      });
    });

    it('never groups off a phone', () => {
      renderOffers();
      expect(document.querySelector('.dt-group-header')).toBeNull();
      expect(offerIds()).toEqual(['1', '2', '3', '4']);
    });
  });
});

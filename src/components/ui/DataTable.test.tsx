import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import {
  DataTable,
  DataTableDenseCell,
  VIRTUALIZE_THRESHOLD,
  type DataTableColumn,
  type DataTableGroupBy,
} from './DataTable';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ContextMenu';
import { Tooltip } from './Tooltip';

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

describe('DataTable selectedRowKey', () => {
  it('marks the selected row aria-current="true", distinct from a highlight', () => {
    renderTable({ selectedRowKey: 2 });
    expect(document.querySelector('[data-row-key="2"]')).toHaveAttribute('aria-current', 'true');
    expect(document.querySelector('[data-row-key="1"]')).not.toHaveAttribute('aria-current');
  });

  it('marks nothing when no row is selected', () => {
    renderTable();
    expect(document.querySelector('[aria-current]')).toBeNull();
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

    it('does not re-sort for a fresh but equal sort object, and does for a new sortValue', () => {
      const sortValue = vi.fn((row: SortRow) => row.value);
      const columnsWith = (value: (row: SortRow) => number | undefined) =>
        sortColumns.map((column) =>
          column.id === 'value' ? { ...column, sortValue: value } : column
        );
      const table = (cols: DataTableColumn<SortRow>[]) => (
        <DataTable
          columns={cols}
          rows={sortRows}
          rowKey={(row) => row.id}
          label="Sortable"
          // A new object every render, as `useUrlSort` hands out after any URL change.
          sort={{ columnId: 'value', direction: 'asc' }}
        />
      );
      const { rerender } = render(table(columnsWith(sortValue)));
      const calls = sortValue.mock.calls.length;
      expect(calls).toBeGreaterThan(0);

      // Rebuilt column objects around the same `sortValue`: no re-sort.
      rerender(table(columnsWith(sortValue)));
      expect(sortValue.mock.calls.length).toBe(calls);

      // A genuinely different `sortValue` still re-sorts.
      rerender(table(columnsWith((row) => (row.value === undefined ? undefined : -row.value))));
      expect(itemNames()).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha']);
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

    // A focusable control inside the row (a tooltip trigger, a link) owns its
    // own Enter/Space; the row must not also activate from the bubbled key.
    it('ignores Enter/Space bubbling up from something focused inside the row', () => {
      const onRowClick = vi.fn();
      renderTable({ onRowClick });
      const [cell] = screen.getAllByRole('cell');
      fireEvent.keyDown(cell!, { key: 'Enter' });
      fireEvent.keyDown(cell!, { key: ' ' });
      expect(onRowClick).not.toHaveBeenCalled();
    });

    // A control inside a clickable row runs its own action only — by mouse
    // and by keyboard — with no stopPropagation workaround on the page.
    describe('controls inside the row', () => {
      function renderWithControls(onRowClick: () => void, onStar: () => void) {
        const onTick = vi.fn();
        renderTable({
          onRowClick,
          columns: [
            ...columns,
            {
              id: 'controls',
              header: 'Controls',
              render: (row) => (
                <>
                  <button type="button" onClick={onStar}>
                    Star {row.item}
                  </button>
                  <input type="checkbox" aria-label={`Tick ${row.item}`} onChange={onTick} />
                  {createPortal(<button type="button">Menu {row.item}</button>, document.body)}
                  <span tabIndex={0}>Figure {row.item}</span>
                  <Tooltip content="Why" openOnTap>
                    <span tabIndex={0}>Tag {row.item}</span>
                  </Tooltip>
                </>
              ),
            },
          ],
        });
        return { onTick };
      }

      it('a button click runs the button, not the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        const onStar = vi.fn();
        renderWithControls(onRowClick, onStar);
        await user.click(screen.getByRole('button', { name: 'Star Tritanium' }));
        expect(onStar).toHaveBeenCalledTimes(1);
        expect(onRowClick).not.toHaveBeenCalled();
      });

      it('Enter and Space on a focused button run the button, not the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        const onStar = vi.fn();
        renderWithControls(onRowClick, onStar);
        screen.getByRole('button', { name: 'Star Tritanium' }).focus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(onStar).toHaveBeenCalledTimes(2);
        expect(onRowClick).not.toHaveBeenCalled();
      });

      it('Space on a focused checkbox ticks it, not the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        const { onTick } = renderWithControls(onRowClick, vi.fn());
        const box = screen.getByRole('checkbox', { name: 'Tick Tritanium' });
        box.focus();
        await user.keyboard(' ');
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(box).toBeChecked();
        expect(onRowClick).not.toHaveBeenCalled();
      });

      // React bubbles events through portals along the component tree, so a
      // menu or modal opened from inside the row would otherwise reach it.
      it('a click inside something portaled out of the row does not reach the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        renderWithControls(onRowClick, vi.fn());
        await user.click(screen.getByRole('button', { name: 'Menu Tritanium' }));
        expect(onRowClick).not.toHaveBeenCalled();
      });

      it('a tap-to-open tooltip trigger keeps the click from the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        renderWithControls(onRowClick, vi.fn());
        await user.click(screen.getByText('Tag Tritanium'));
        expect(onRowClick).not.toHaveBeenCalled();
      });

      // Focusable only so the keyboard can reach a hover tooltip (an ISK
      // figure) — it has no click action of its own.
      it('a click on a merely focusable span still runs the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        renderWithControls(onRowClick, vi.fn());
        await user.click(screen.getByText('Figure Tritanium'));
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
      });

      it('a click on plain row content still runs the row', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        renderWithControls(onRowClick, vi.fn());
        await user.click(screen.getAllByRole('cell')[0]!);
        expect(onRowClick).toHaveBeenCalledWith(rows[0]);
      });
    });

    it('leaves rows non-focusable when no row click handler is wired up', () => {
      renderTable();
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).not.toHaveAttribute('tabindex');
    });
  });

  describe('expandableRow', () => {
    const expandableRow = { renderDetail: (row: Row) => `Detail for ${row.item}` };

    it('opens the detail row on click and closes it on a second click', async () => {
      const user = userEvent.setup();
      renderTable({ expandableRow });
      expect(screen.queryByText('Detail for Tritanium')).not.toBeInTheDocument();

      const cells = screen.getAllByRole('cell');
      await user.click(cells[0]);
      expect(screen.getByText('Detail for Tritanium')).toBeInTheDocument();

      await user.click(cells[0]);
      expect(screen.queryByText('Detail for Tritanium')).not.toBeInTheDocument();
    });

    it('keeps at most one row open — opening a second row closes the first', async () => {
      const user = userEvent.setup();
      renderTable({ expandableRow });
      const [, firstRow, secondRow] = screen.getAllByRole('row');
      await user.click(firstRow.querySelector('td')!);
      expect(screen.getByText('Detail for Tritanium')).toBeInTheDocument();

      await user.click(secondRow.querySelector('td')!);
      expect(screen.queryByText('Detail for Tritanium')).not.toBeInTheDocument();
      expect(screen.getByText('Detail for Pyerite')).toBeInTheDocument();
    });

    it('makes rows focusable and responds to Enter, same as onRowClick', async () => {
      const user = userEvent.setup();
      renderTable({ expandableRow });
      const [, firstRow] = screen.getAllByRole('row');
      expect(firstRow).toHaveClass('focus-visible:outline-accent');

      firstRow.focus();
      await user.keyboard('{Enter}');
      expect(screen.getByText('Detail for Tritanium')).toBeInTheDocument();
    });

    it('fires onRowClick too, when both are given', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      renderTable({ expandableRow, onRowClick });
      const cells = screen.getAllByRole('cell');
      await user.click(cells[0]);
      expect(onRowClick).toHaveBeenCalledWith(rows[0]);
      expect(screen.getByText('Detail for Tritanium')).toBeInTheDocument();
    });
  });

  // The collapse itself is CSS (`.dt-stacked`, src/styles/index.css) and jsdom
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

    it('shows cards (`dt-stacked`) below `sm`, or wherever the caller says', () => {
      const real = window.matchMedia;
      window.matchMedia = ((media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList) as typeof window.matchMedia;
      try {
        const phone = renderTable();
        expect(screen.getByRole('table')).toHaveClass('dt-stacked');
        phone.unmount();
        // A table that knows it has room keeps its columns even on a phone.
        const wide = renderTable({ stacked: false });
        expect(screen.getByRole('table')).not.toHaveClass('dt-stacked');
        wide.unmount();
      } finally {
        window.matchMedia = real;
      }

      // jsdom's own `matchMedia` never matches: a desktop viewport.
      const desktop = renderTable();
      expect(screen.getByRole('table')).not.toHaveClass('dt-stacked');
      desktop.unmount();
      const forced = renderTable({ stacked: true });
      expect(screen.getByRole('table')).toHaveClass('dt-stack', 'dt-stacked');
      forced.unmount();
      // Never cards without the stack layout to show them in.
      renderTable({ stacked: true, responsive: 'table' });
      expect(screen.getByRole('table')).not.toHaveClass('dt-stacked');
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

    it('pins stackEdge cells to the card edges, off the meta line', () => {
      renderTable({
        columns: [
          { id: 'pick', header: 'Pick', stackEdge: 'start', render: () => 'x' },
          // The edge cell leads, so the title has to be named.
          { ...denseColumns[0]!, primary: true },
          ...denseColumns.slice(1),
          { id: 'qty', header: 'Qty', stackEdge: 'end', render: () => '5' },
        ],
        stackLayout: 'dense',
      });
      const [pick, item, amount, , , qty] = screen.getAllByRole('cell');
      expect(pick).toHaveClass('dt-edge', 'dt-edge-start');
      expect(pick).not.toHaveClass('dt-meta');
      expect(qty).toHaveClass('dt-edge', 'dt-edge-end');
      expect(qty).not.toHaveClass('dt-meta');
      // A leading edge cell is not the first meta cell: Amount still is.
      expect(item).toHaveClass('dt-primary');
      expect(amount).toHaveClass('dt-meta', 'dt-meta-first');
    });

    it('leaves stackEdge cells as plain cells outside the dense stack', () => {
      renderTable({
        columns: [
          { id: 'pick', header: 'Pick', stackEdge: 'start', render: () => 'x' },
          ...denseColumns,
        ],
      });
      expect(document.querySelector('.dt-edge')).toBeNull();
    });

    it('is ignored when the table does not stack', () => {
      renderTable({ columns: denseColumns, stackLayout: 'dense', responsive: 'table' });
      expect(screen.getByRole('table')).not.toHaveClass('dt-stack-dense');
      expect(document.querySelector('.dt-meta')).toBeNull();
    });

    it('DataTableDenseCell stays inline-flex, never flex, so it can sit on the meta line', () => {
      render(<DataTableDenseCell>content</DataTableDenseCell>);
      const cell = screen.getByText('content');
      expect(cell).toHaveClass('inline-flex');
      expect(cell).not.toHaveClass('flex');
    });
  });

  describe('cardCorner start', () => {
    const cornerColumns: DataTableColumn<Row>[] = [
      { id: 'select', header: '', cardCorner: 'start', render: () => <input type="checkbox" /> },
      ...columns,
    ];

    it('tags a start corner separately from the default (top-right) one', () => {
      renderTable({ columns: cornerColumns });
      const corner = document.querySelector('td.dt-corner');
      expect(corner).toHaveClass('dt-corner-start');
    });

    it('is untagged by default — a plain cardCorner: true column keeps its old class only', () => {
      const rightCornerColumns: DataTableColumn<Row>[] = [
        { id: 'corner', header: '', cardCorner: true, render: () => 'x' },
        ...columns,
      ];
      renderTable({ columns: rightCornerColumns });
      const corner = document.querySelector('td.dt-corner');
      expect(corner).not.toHaveClass('dt-corner-start');
    });

    // The disclosure chevron (`expandableRow`) always clusters beside the
    // actions button now — see the `disclosure` describe block below. This
    // block only covers the corner's own `'start'` side and its interaction
    // with that cluster (a table with all three: cardCorner, expandableRow,
    // rowMoreActions — Hauling's own case).
    it('a start corner is not shifted by the actions+disclosure triple-collision rule (that rule targets the default right corner)', () => {
      renderTable({
        columns: cornerColumns,
        rowMoreActions: true,
        expandableRow: { renderDetail: () => <div>detail</div> },
      });
      const corner = document.querySelector('td.dt-corner-start')!;
      // jsdom doesn't compute the `@media (width < 40rem)` cascade, so this
      // asserts the selector scope rather than a resolved `right` value:
      // `:not(.dt-corner-start)` on the triple-collision rule means it can
      // never match this cell regardless of viewport.
      expect(corner.matches('.dt-corner:not(.dt-corner-start)')).toBe(false);
    });
  });

  describe('disclosure chevron (expandableRow)', () => {
    it('tags the chevron cell so it clusters beside the actions button in the stacked card', () => {
      renderTable({
        rowMoreActions: true,
        expandableRow: { renderDetail: () => <div>detail</div> },
      });
      expect(document.querySelector('td.dt-disclosure')).not.toBeNull();
    });

    it('is present even without a More-actions button (it just flows on its own instead)', () => {
      renderTable({ expandableRow: { renderDetail: () => <div>detail</div> } });
      expect(document.querySelector('td.dt-disclosure')).not.toBeNull();
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

    it('groups at every width when the grouping asks to, and a member row still opens', async () => {
      const user = userEvent.setup();
      renderOffers({
        groupBy: { ...groupBy, allWidths: true },
        expandableRow: { renderDetail: (row) => `detail-${row.id}` },
      });
      const toggle = screen.getByRole('button', { name: 'Jita→Amarr ×2' });
      expect(offerIds()).toEqual(['2', '4']);
      await user.click(toggle);
      expect(offerIds()).toEqual(['1', '3', '2', '4']);
      await user.click(screen.getByText('offer-3'));
      expect(screen.getByText('detail-3')).toBeInTheDocument();
    });

    it('never groups off a phone', () => {
      renderOffers();
      expect(document.querySelector('.dt-group-header')).toBeNull();
      expect(offerIds()).toEqual(['1', '2', '3', '4']);
    });
  });
});

describe('DataTable fullWidthRow', () => {
  it('renders a row as one cell across every column, with no column renders and no expand', async () => {
    const user = userEvent.setup();
    const render0 = vi.fn((row: Row) => row.item);
    render(
      <DataTable
        columns={[{ ...columns[0], render: render0 }, columns[1]]}
        rows={[rows[0], { id: 9, item: 'between', amount: 0, expired: false }, rows[1]]}
        rowKey={(row) => row.id}
        label="Items"
        fullWidthRow={(row) => (row.id === 9 ? <span>Full width note</span> : null)}
        rowClassName={(row) => (row.id === 9 ? 'note-row' : undefined)}
        expandableRow={{ renderDetail: (row) => `detail ${row.item}` }}
      />
    );
    const cell = screen.getByText('Full width note').closest('td');
    expect(cell).toHaveAttribute('colspan', '3');
    const tr = cell?.closest('tr');
    expect(tr).toHaveClass('dt-full-row', 'note-row');
    expect(render0).not.toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    await user.click(screen.getByText('Full width note'));
    expect(screen.queryByText('detail between')).toBeNull();
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
  });
});

describe('DataTable virtualize', () => {
  const many: Row[] = Array.from({ length: 1_000 }, (_, i) => ({
    id: i + 1,
    item: `Item ${i + 1}`,
    amount: 1_000 - i,
    expired: false,
  }));
  const sortableColumns: DataTableColumn<Row>[] = [
    { id: 'item', header: 'Item', render: (row) => row.item },
    { id: 'amount', header: 'Amount', render: (row) => row.amount, sortValue: (row) => row.amount },
  ];
  const mountedIds = () =>
    Array.from(document.querySelectorAll('tbody tr[data-row-key]')).map((tr) =>
      tr.getAttribute('data-row-key')
    );

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('mounts only a window of rows, sorted over the whole set first', () => {
    render(
      <DataTable
        label="Offers"
        columns={sortableColumns}
        rows={many}
        rowKey={(row) => row.id}
        defaultSort={{ columnId: 'amount', direction: 'asc' }}
        virtualize
      />
    );

    const ids = mountedIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(100);
    // Cheapest of all 1,000 leads, not the cheapest of some first slice.
    expect(ids[0]).toBe('1000');
    // The spacer standing in for the unmounted rows is not a table row to AT.
    expect(screen.getAllByRole('row').length).toBe(ids.length + 1);
  });

  it('reaches the last row by scrolling the page', () => {
    render(
      <DataTable
        label="Offers"
        columns={sortableColumns}
        rows={many}
        rowKey={(row) => row.id}
        virtualize
      />
    );
    expect(mountedIds()).not.toContain('1000');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1_000_000 });
    fireEvent.scroll(window);

    expect(mountedIds()).toContain('1000');
    expect(mountedIds()).not.toContain('1');
  });

  it('renders every row when not asked to virtualize', () => {
    render(
      <DataTable label="Offers" columns={sortableColumns} rows={many} rowKey={(row) => row.id} />
    );

    expect(mountedIds()).toHaveLength(1_000);
  });
  describe('virtualize="auto"', () => {
    const rowsOf = (count: number) => many.slice(0, count);
    const byId = (row: Row) => row.id;

    it(`keeps every row mounted up to ${VIRTUALIZE_THRESHOLD} rows`, () => {
      render(
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(VIRTUALIZE_THRESHOLD)}
          rowKey={byId}
          virtualize="auto"
        />
      );

      expect(mountedIds()).toHaveLength(VIRTUALIZE_THRESHOLD);
      expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBeNull();
    });

    it('windows once the rows pass the threshold, telling AT the full count', () => {
      render(
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(VIRTUALIZE_THRESHOLD + 1)}
          rowKey={byId}
          virtualize="auto"
        />
      );

      expect(mountedIds().length).toBeLessThan(100);
      expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe(
        String(VIRTUALIZE_THRESHOLD + 2)
      );
      expect(document.querySelector('[data-row-key="1"]')?.getAttribute('aria-rowindex')).toBe('2');
    });

    it('leaves scroll anchoring on for a windowed table without expandable rows', () => {
      // A newest-first ledger relies on it to hold the view when a refresh
      // adds rows above the viewport.
      render(
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(VIRTUALIZE_THRESHOLD + 1)}
          rowKey={byId}
          virtualize="auto"
        />
      );

      expect(mountedIds().length).toBeLessThan(100);
      expect(document.querySelector('tbody')?.className).not.toContain('overflow-anchor');
    });

    describe('with expandableRow', () => {
      const ROW_HEIGHT = 29; // the default-density estimate, so unmeasured rows agree
      const DETAIL_HEIGHT = 300;
      let detailHeight = DETAIL_HEIGHT;
      const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
      let scrollTo: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        // jsdom has no layout: a main row measures one line, an open detail
        // far more. Everything else keeps the suite-wide stand-in.
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
          configurable: true,
          get(this: HTMLElement) {
            if (this.classList.contains('dt-row-detail')) return detailHeight;
            if (this.tagName === 'TR' && this.hasAttribute('data-index')) return ROW_HEIGHT;
            return offsetHeight.get!.call(this);
          },
        });
        // Collapsing a row above the viewport moves the page by its delta.
        scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
          Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: options.top ?? 0,
          });
        }) as typeof window.scrollTo);
      });
      afterEach(() => {
        detailHeight = DETAIL_HEIGHT;
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
        scrollTo.mockRestore();
      });

      const table = (
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(500)}
          rowKey={byId}
          virtualize="auto"
          expandableRow={{ renderDetail: (row) => `Detail ${row.id}` }}
        />
      );
      const rowOf = (key: number) => document.querySelector<HTMLElement>(`[data-row-key="${key}"]`);
      const firstMountedIndex = () =>
        Number(document.querySelector('tbody tr[data-index]')?.getAttribute('data-index'));
      const spacerBefore = () =>
        parseFloat(document.querySelector<HTMLElement>('tbody .dt-spacer')?.style.height ?? '0');
      const scrollPage = (top: number) => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
        fireEvent.scroll(window);
      };

      it('windows past the threshold, placing the rows below an open row after its detail', async () => {
        const user = userEvent.setup();
        render(table);
        expect(mountedIds().length).toBeLessThan(100);

        await user.click(rowOf(1)!.querySelector('td')!);

        const detail = screen.getByText('Detail 1').closest('tr');
        expect(rowOf(1)?.nextElementSibling).toBe(detail);
        expect(detail?.nextElementSibling).toBe(rowOf(2));
        // The detail is a row to AT too: counted, and indexed between its
        // own row and the next.
        expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('502');
        expect(rowOf(1)?.getAttribute('aria-rowindex')).toBe('2');
        expect(detail?.getAttribute('aria-rowindex')).toBe('3');
        expect(rowOf(2)?.getAttribute('aria-rowindex')).toBe('4');

        // Scrolled past, the open row still takes its detail's height: every
        // row below it sits that much lower.
        scrollPage(5_000);
        expect(mountedIds()).not.toContain('1');
        expect(spacerBefore()).toBe(firstMountedIndex() * ROW_HEIGHT + DETAIL_HEIGHT);
      });

      it('gives the height back when an open row out of the window closes', async () => {
        const user = userEvent.setup();
        render(table);
        await user.click(rowOf(1)!.querySelector('td')!);
        scrollPage(5_000);
        expect(spacerBefore()).toBe(firstMountedIndex() * ROW_HEIGHT + DETAIL_HEIGHT);

        // Opening another row closes the first, which isn't mounted to
        // measure itself again.
        const target = Number(mountedIds()[5]);
        await user.click(rowOf(target)!.querySelector('td')!);

        expect(screen.queryByText('Detail 1')).toBeNull();
        expect(screen.getByText(`Detail ${target}`)).toBeInTheDocument();
        expect(spacerBefore()).toBe(firstMountedIndex() * ROW_HEIGHT);
        // TanStack moved the page for that; the browser's scroll anchoring
        // must not move it a second time for the spacer shrinking.
        expect(document.querySelector('tbody')?.className).toContain('[overflow-anchor:none]');
      });

      it('takes up a detail that grows while the page is scrolling', async () => {
        // A ResizeObserver whose callbacks the test can fire: jsdom's stub
        // never calls back.
        const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
        const original = globalThis.ResizeObserver;
        globalThis.ResizeObserver = class {
          private entry: { callback: ResizeObserverCallback; targets: Element[] };
          constructor(callback: ResizeObserverCallback) {
            this.entry = { callback, targets: [] };
            observers.push(this.entry);
          }
          observe(target: Element) {
            this.entry.targets.push(target);
          }
          unobserve() {}
          disconnect() {}
        } as unknown as typeof ResizeObserver;
        try {
          const user = userEvent.setup();
          render(table);
          await user.click(rowOf(1)!.querySelector('td')!);
          const detail = screen.getByText('Detail 1').closest('tr')!;
          const watcher = observers.find((o) => o.targets.includes(detail));
          expect(watcher).toBeDefined();

          // Mid-scroll — TanStack's own measuring skips this — the detail's
          // content arrives and it grows.
          scrollPage(10);
          detailHeight = 500;
          watcher!.callback([], watcher as unknown as ResizeObserver);

          scrollPage(5_000);
          expect(spacerBefore()).toBe(firstMountedIndex() * ROW_HEIGHT + 500);
        } finally {
          globalThis.ResizeObserver = original;
        }
      });

      it('keeps the focused row across expanding and collapsing it', async () => {
        const user = userEvent.setup();
        render(table);
        const row = rowOf(5);
        row?.focus();

        await user.keyboard('{Enter}');
        expect(screen.getByText('Detail 5')).toBeInTheDocument();
        expect(rowOf(5)).toBe(row);
        expect(document.activeElement).toBe(row);

        await user.keyboard('{Enter}');
        expect(screen.queryByText('Detail 5')).toBeNull();
        expect(rowOf(5)).toBe(row);
        expect(document.activeElement).toBe(row);
      });
    });

    it('switches between every row and a window as the rows cross the threshold', () => {
      const table = (count: number) => (
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(count)}
          rowKey={byId}
          virtualize="auto"
        />
      );
      const { rerender } = render(table(VIRTUALIZE_THRESHOLD));
      expect(mountedIds()).toHaveLength(VIRTUALIZE_THRESHOLD);

      // A live refresh or a cleared filter pushes it over…
      rerender(table(VIRTUALIZE_THRESHOLD + 1));
      expect(mountedIds().length).toBeLessThan(100);
      expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe(
        String(VIRTUALIZE_THRESHOLD + 2)
      );

      // …and a narrowing filter brings it back under.
      rerender(table(VIRTUALIZE_THRESHOLD));
      expect(mountedIds()).toHaveLength(VIRTUALIZE_THRESHOLD);
      expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBeNull();
      expect(document.querySelector('.dt-spacer')).toBeNull();
    });

    it('keeps a focused row mounted and focused as the rows cross the threshold', () => {
      const table = (count: number) => (
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={rowsOf(count)}
          rowKey={byId}
          virtualize="auto"
          onRowClick={() => {}}
        />
      );
      const { rerender } = render(table(VIRTUALIZE_THRESHOLD));
      const row = document.querySelector<HTMLElement>('[data-row-key="5"]');
      row?.focus();
      expect(document.activeElement).toBe(row);

      rerender(table(VIRTUALIZE_THRESHOLD + 1));
      expect(document.querySelector('[data-row-key="5"]')).toBe(row);
      expect(document.activeElement).toBe(row);

      rerender(table(VIRTUALIZE_THRESHOLD));
      expect(document.querySelector('[data-row-key="5"]')).toBe(row);
      expect(document.activeElement).toBe(row);
    });

    describe('highlightRowKey', () => {
      let scrollTo: ReturnType<typeof vi.spyOn>;
      let scrollIntoView: ReturnType<typeof vi.spyOn>;
      /** What a real scroll to `top` looks like to the page: `scrollY`, then a later `scroll` event. */
      const scrollPageTo = (top: number) => {
        Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
        setTimeout(() => window.dispatchEvent(new Event('scroll')));
      };

      beforeEach(() => {
        scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
        // jsdom has no layout: stand in for a long page and for the browser
        // moving it. TanStack clamps its target to the document's scroll height.
        Object.defineProperty(document.documentElement, 'scrollHeight', {
          configurable: true,
          value: 1_000_000,
        });
        scrollTo = vi
          .spyOn(window, 'scrollTo')
          .mockImplementation(((options: ScrollToOptions) =>
            scrollPageTo(options.top ?? 0)) as typeof window.scrollTo);
      });
      afterEach(() => {
        delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
        scrollTo.mockRestore();
        scrollIntoView.mockRestore();
      });

      const table = (highlightRowKey: number | null) => (
        <DataTable
          label="Offers"
          columns={sortableColumns}
          rows={many}
          rowKey={byId}
          virtualize="auto"
          highlightRowKey={highlightRowKey}
        />
      );
      const arrivedAt = (key: number) =>
        waitFor(() =>
          expect(
            document.querySelector(`[data-row-key="${key}"]`)?.getAttribute('aria-current')
          ).toBe('location')
        );

      it('scrolls a row outside the window into it, then pulses and focuses it', async () => {
        render(table(900));

        await arrivedAt(900);
        const row = document.querySelector<HTMLElement>('[data-row-key="900"]');
        expect(row?.className).toContain('row-pulse');
        expect(document.activeElement).toBe(row);
        expect(scrollTo).toHaveBeenCalled();
        expect(scrollIntoView.mock.instances).toContain(row);
      });

      it('scrolls to an open row outside the window, detail and all', async () => {
        const user = userEvent.setup();
        const expandable = (highlightRowKey: number | null) => (
          <DataTable
            label="Offers"
            columns={sortableColumns}
            rows={many}
            rowKey={byId}
            virtualize="auto"
            highlightRowKey={highlightRowKey}
            expandableRow={{ renderDetail: (row) => `Detail ${row.id}` }}
          />
        );
        const { rerender } = render(expandable(null));
        await user.click(document.querySelector('[data-row-key="3"] td')!);
        scrollPageTo(20_000);
        await waitFor(() => expect(mountedIds()).not.toContain('3'));

        rerender(expandable(3));

        await arrivedAt(3);
        const row = document.querySelector<HTMLElement>('[data-row-key="3"]');
        expect(document.activeElement).toBe(row);
        expect(row?.nextElementSibling?.textContent).toBe('Detail 3');
      });

      it('scrolls to the same row again for a new link after the key cleared', async () => {
        const { rerender } = render(table(900));
        await arrivedAt(900);

        rerender(table(null));
        scrollPageTo(0);
        await waitFor(() => expect(mountedIds()).not.toContain('900'));
        scrollTo.mockClear();

        rerender(table(900));
        await arrivedAt(900);
        expect(scrollTo).toHaveBeenCalled();
      });
    });
  });
});

describe('DataTable row memoization', () => {
  // A plain log rather than `vi.fn`: this suite's config resets mock
  // implementations between tests.
  let rendered: number[] = [];
  const renderItem = (row: Row) => {
    rendered.push(row.id);
    return row.item;
  };
  const spiedColumns: DataTableColumn<Row>[] = [
    { id: 'item', header: 'Item', render: renderItem },
    { id: 'amount', header: 'Amount', render: (row) => row.amount },
  ];
  const byId = (row: Row) => row.id;
  const tenRows: Row[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    item: `Item ${i + 1}`,
    amount: i,
    expired: false,
  }));

  function Page() {
    const [clicks, setClicks] = useState(0);
    const [selected, setSelected] = useState<number | null>(1);
    return (
      <>
        <button type="button" onClick={() => setClicks((n) => n + 1)}>
          Unrelated {clicks}
        </button>
        <button type="button" onClick={() => setSelected(2)}>
          Select second
        </button>
        <DataTable
          label="Items"
          columns={spiedColumns}
          rows={tenRows}
          rowKey={byId}
          selectedRowKey={selected}
          // Inline, as most callers pass it: rows reach it through a stable
          // activator, so it mustn't cost a re-render of every row.
          onRowClick={() => {}}
        />
      </>
    );
  }

  beforeEach(() => {
    rendered = [];
  });

  it('re-renders no row for parent state the rows do not read', async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(rendered).toHaveLength(10);
    rendered = [];

    await user.click(screen.getByRole('button', { name: /Unrelated/ }));

    expect(screen.getByRole('button', { name: 'Unrelated 1' })).toBeTruthy();
    expect(rendered).toEqual([]);
  });

  it('re-renders only the rows whose selection changed', async () => {
    const user = userEvent.setup();
    render(<Page />);
    rendered = [];

    await user.click(screen.getByRole('button', { name: 'Select second' }));

    expect([...rendered].sort()).toEqual([1, 2]);
    expect(document.querySelector('[data-row-key="2"]')?.getAttribute('aria-current')).toBe('true');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { TableModel } from './data/types';
import type { RowsPerPage } from './tableSortPage';
import { TableBody } from './TableBody';

function model(count: number, over: Partial<TableModel> = {}): TableModel {
  return {
    pageable: true,
    columns: [
      { key: 'item', label: 'Item', sortable: true },
      { key: 'price', label: 'Price', align: 'end', sortable: true },
      { key: 'note', label: 'Note' },
    ],
    // Row n costs n * 10; row 3 has no price.
    rows: Array.from({ length: count }, (_, i) => ({
      key: `r${i + 1}`,
      cells: [`Item ${i + 1}`, i === 2 ? '—' : `${(i + 1) * 10}`, 'x'],
      sort: [`Item ${i + 1}`, i === 2 ? undefined : (i + 1) * 10, undefined],
    })),
    ...over,
  };
}

function setup(table: TableModel, rowsPerPage: RowsPerPage = 5) {
  const onRowsPerPage = vi.fn();
  const ui = (t: TableModel, rpp: RowsPerPage) => (
    <MemoryRouter>
      <TableBody
        table={t}
        columnsFor="L"
        rowLimit={3}
        ariaLabel="Sample"
        paging={{ rowsPerPage: rpp, onRowsPerPage }}
      />
    </MemoryRouter>
  );
  const view = render(ui(table, rowsPerPage));
  return {
    onRowsPerPage,
    rerender: (t: TableModel, rpp: RowsPerPage = rowsPerPage) => view.rerender(ui(t, rpp)),
  };
}

const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row');
const firstCells = () => bodyRows().map((r) => within(r).getAllByRole('cell')[0]!.textContent);

describe('TableBody sorting', () => {
  it('turns only the opted-in headers into sort buttons', () => {
    setup(model(4));
    expect(screen.getByRole('button', { name: 'Sort by Price' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Note/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Note' })).not.toHaveAttribute('aria-sort');
  });

  it('sorts ascending, then descending, naming the direction, with a row missing a value last', async () => {
    const user = userEvent.setup();
    setup(model(4));
    await user.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(firstCells()).toEqual(['Item 1', 'Item 2', 'Item 4', 'Item 3']);
    await user.click(screen.getByRole('button', { name: 'Price, sorted ascending' }));
    expect(screen.getByRole('button', { name: 'Price, sorted descending' })).toBeInTheDocument();
    expect(firstCells()).toEqual(['Item 4', 'Item 2', 'Item 1', 'Item 3']);
  });

  it('sorts a table that is not paged too', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TableBody table={model(4, { pageable: false })} columnsFor="L" rowLimit={10} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(firstCells()[0]).toBe('Item 1');
  });
});

describe('TableBody paging', () => {
  it('shows one page, its range, and no "+N more"', () => {
    setup(model(12));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('steps through pages and disables the caret at each end', async () => {
    const user = userEvent.setup();
    setup(model(12));
    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    await user.click(next);
    expect(screen.getByText('6–10 of 12')).toBeInTheDocument();
    expect(firstCells()[0]).toBe('Item 6');
    await user.click(next);
    expect(screen.getByText('11–12 of 12')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    expect(next).toBeDisabled();
    await user.click(next);
    expect(screen.getByText('11–12 of 12')).toBeInTheDocument();
  });

  it('goes back to page 1 when the sort changes', async () => {
    const user = userEvent.setup();
    setup(model(12));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument();
  });

  it('offers 5, 10 and 25 rows per page and reports the pick', async () => {
    const user = userEvent.setup();
    const { onRowsPerPage } = setup(model(12));
    const group = screen.getByRole('group', { name: 'Rows per page' });
    expect(within(group).getByRole('button', { name: '5' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(group).getByRole('button', { name: '25' }));
    expect(onRowsPerPage).toHaveBeenCalledWith(25);
  });

  it('shows more rows when the page size grows and returns to page 1', async () => {
    const user = userEvent.setup();
    const { rerender } = setup(model(12));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    rerender(model(12), 10);
    expect(screen.getByText('1–10 of 12')).toBeInTheDocument();
  });

  it('never strands the reader on an empty page when the rows shrink', async () => {
    const user = userEvent.setup();
    const { rerender } = setup(model(12));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    rerender(model(6));
    expect(screen.getByText('6–6 of 6')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it('draws no pager when everything fits the smallest page', () => {
    setup(model(5));
    expect(screen.queryByRole('group', { name: 'Rows per page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(bodyRows()).toHaveLength(5);
  });

  it('keeps the old row limit and "+N more" for a table that did not opt in', () => {
    render(
      <MemoryRouter>
        <TableBody
          table={model(12, { pageable: false })}
          columnsFor="L"
          rowLimit={3}
          paging={{ rowsPerPage: 5, onRowsPerPage: () => {} }}
        />
      </MemoryRouter>
    );
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('+9 more')).toBeInTheDocument();
  });

  it('keeps the old row limit when the caller passes no paging (the chart-side table)', () => {
    render(
      <MemoryRouter>
        <TableBody table={model(12)} columnsFor="L" rowLimit={3} />
      </MemoryRouter>
    );
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('+9 more')).toBeInTheDocument();
  });

  it('opens the hidden rows in place from "+N more"', async () => {
    render(
      <MemoryRouter>
        <TableBody table={model(12)} columnsFor="L" rowLimit={3} />
      </MemoryRouter>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '+9 more' }));
    expect(bodyRows()).toHaveLength(12);
    expect(screen.queryByText('+9 more')).toBeNull();
  });

  it('moves focus to the first revealed row and collapses again from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TableBody table={model(12)} columnsFor="L" rowLimit={3} />
      </MemoryRouter>
    );
    act(() => screen.getByRole('button', { name: '+9 more' }).focus());
    await user.keyboard('{Enter}');
    expect(bodyRows()).toHaveLength(12);
    expect(bodyRows()[3]).toHaveFocus();
    // Tab onward reaches the toggle, which now says how to put the rows back.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByRole('button', { name: '+9 more' })).toBeInTheDocument();
  });
});

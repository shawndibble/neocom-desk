import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import * as download from '@/lib/download';
import { DataTable, type DataTableColumn } from './DataTable';
import { MenuItem, RowActionsMenu, RowMoreActions } from './RowActions';
import { TableActionsMenu, TableExportProvider } from './TableExport';
import { useTableExport } from './useTableExport';

interface Row {
  id: number;
  item: string;
  amount: number;
}

const rows: Row[] = [
  { id: 1, item: 'Tritanium', amount: 250 },
  { id: 2, item: 'Cap Booster 200', amount: 80 },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'item', header: 'Item', render: (r) => r.item, sortValue: (r) => r.item },
  { id: 'amount', header: 'Amount', render: (r) => r.amount, sortValue: (r) => r.amount },
];

const csvColumns = [
  { header: 'Item', value: (r: Row) => r.item },
  { header: 'Amount', value: (r: Row) => r.amount },
];

function Harness({ withRowMenu = false }: { withRowMenu?: boolean }) {
  const tableExport = useTableExport({ surface: 'market-sell', rows, columns: csvColumns });
  return (
    <>
      <TableActionsMenu name="Sell orders" tableExport={tableExport} />
      <DataTable
        {...tableExport.tableProps}
        label="Sell orders"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        defaultSort={{ columnId: 'amount', direction: 'asc' }}
        rowMoreActions={withRowMenu}
        rowContextMenu={
          withRowMenu
            ? (row, tr) => (
                <RowActionsMenu
                  key={row.id}
                  name={row.item}
                  items={<MenuItem>View {row.item}</MenuItem>}
                >
                  {tr}
                </RowActionsMenu>
              )
            : undefined
        }
      />
    </>
  );
}

let copied: string[];
beforeEach(() => {
  copied = [];
  configureClipboard(async (text) => {
    copied.push(text);
  });
});
afterEach(() => {
  configureClipboard(null);
  vi.restoreAllMocks();
});

/** Into the submenu by keyboard, as RowActions.test.tsx drives submenus (jsdom has no hover intent). */
async function openExportSub(user: ReturnType<typeof userEvent.setup>) {
  (await screen.findByRole('menuitem', { name: 'Export table' })).focus();
  await user.keyboard('{ArrowRight}');
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  (await screen.findByRole('menuitem', { name })).focus();
  await user.keyboard('{Enter}');
}

describe('TableActionsMenu', () => {
  it('is a download button holding just the formats when export is its only job', async () => {
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Sell orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('menuitem', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.queryByRole('menuitem', { name: 'Export table' })).not.toBeInTheDocument();
  });

  it('becomes a ⋯ menu with Export in a submenu once it has other actions', async () => {
    const user = userEvent.setup();
    function WithActions() {
      const tableExport = useTableExport({ surface: 'market-sell', rows, columns: csvColumns });
      return (
        <TableActionsMenu name="Sell orders" tableExport={tableExport}>
          <MenuItem>Refresh</MenuItem>
        </TableActionsMenu>
      );
    }
    render(<WithActions />);
    expect(screen.queryByRole('button', { name: 'Export Sell orders' })).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sell orders actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
    await openExportSub(user);
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
  });

  it('copies the table as TSV, in on-screen sort order', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Sell orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe('Item\tAmount\nCap Booster 200\t80\nTritanium\t250\n');
  });

  it('downloads a CSV named for the surface', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Sell orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await choose(user, 'Download CSV');
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/^neocom-market-sell-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(spy.mock.calls[0][1]).toContain('"Cap Booster 200",80');
  });

  it('downloads an xlsx', async () => {
    const spy = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Sell orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await choose(user, 'Download Excel (.xlsx)');
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/\.xlsx$/);
  });
});

describe('TableExportProvider', () => {
  it("gives a non-DataTable list's row menus the Export submenu, exporting the whole list", async () => {
    const user = userEvent.setup();
    render(
      <TableExportProvider
        tableExport={{ surface: 'assets', columns: csvColumns, getRows: () => rows }}
      >
        <RowActionsMenu name="Tritanium" items={<MenuItem>Show info</MenuItem>}>
          <div>Tritanium</div>
        </RowActionsMenu>
      </TableExportProvider>
    );
    fireEvent.contextMenu(screen.getByText('Tritanium'));
    await openExportSub(user);
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0].trim().split('\n')).toHaveLength(3);
  });
});

describe("useTableExport source: 'sorted-rows'", () => {
  const all: Row[] = [
    { id: 1, item: 'Tritanium', amount: 250 },
    { id: 2, item: 'Cap Booster 200', amount: 80 },
    { id: 3, item: 'Pyerite', amount: 5 },
  ];

  /** Mounts only the first two rows, as a "Show all"-capped table does. */
  function Capped() {
    const tableExport = useTableExport({
      surface: 'market-sell',
      rows: all,
      columns: csvColumns,
      source: 'sorted-rows',
    });
    return (
      <>
        <TableActionsMenu name="Sell orders" tableExport={tableExport} />
        <DataTable
          {...tableExport.tableProps}
          label="Sell orders"
          rows={all.slice(0, 2)}
          rowKey={(r) => r.id}
          columns={columns}
          defaultSort={{ columnId: 'amount', direction: 'asc' }}
        />
      </>
    );
  }

  it("exports every row, not just the mounted ones, in the table's current sort", async () => {
    const user = userEvent.setup();
    render(<Capped />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Sell orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe('Item\tAmount\nPyerite\t5\nCap Booster 200\t80\nTritanium\t250\n');
  });
});

describe('DataTable exportable', () => {
  it('gives a table without row menus a right-click menu of just the formats', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.contextMenu(screen.getByRole('table'));
    expect(await screen.findByRole('menuitem', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Export table' })).not.toBeInTheDocument();
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
  });

  it("appends Export to every row's right-click menu, after the row's own items", async () => {
    const user = userEvent.setup();
    render(<Harness withRowMenu />);
    const [, firstRow] = screen.getAllByRole('row');
    fireEvent.contextMenu(firstRow);
    expect(await screen.findByRole('menuitem', { name: /^View / })).toBeInTheDocument();
    await openExportSub(user);
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
    // The whole table, not just the row that was right-clicked.
    expect(copied[0].trim().split('\n')).toHaveLength(3);
  });

  it("appends Export to the row's More actions dropdown too", async () => {
    render(<Harness withRowMenu />);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Cap Booster 200' }),
      { button: 0, pointerType: 'mouse' }
    );
    expect(await screen.findByRole('menuitem', { name: 'Export table' })).toBeInTheDocument();
  });

  it('leaves a RowMoreActions outside an exportable table untouched', async () => {
    render(
      <RowActionsMenu name="Rifter" items={<MenuItem>Fit</MenuItem>}>
        <div>
          Rifter
          <RowMoreActions />
        </div>
      </RowActionsMenu>
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for Rifter' }), {
      button: 0,
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('menuitem', { name: 'Fit' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Export table' })).not.toBeInTheDocument();
  });
});

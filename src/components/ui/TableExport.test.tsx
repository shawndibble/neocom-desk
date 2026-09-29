import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import * as download from '@/lib/download';
import { DataTable, type DataTableColumn } from './DataTable';
import { MenuItem, RowActionsMenu, RowMoreActions } from './RowActions';
import { TableActionsMenu } from './TableExport';
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
  it('copies the table as TSV, in on-screen sort order', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sell orders actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await openExportSub(user);
    await choose(user, 'Copy for Google Sheets / Excel');
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toBe('Item\tAmount\nCap Booster 200\t80\nTritanium\t250\n');
  });

  it('downloads a CSV named for the surface', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sell orders actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await openExportSub(user);
    await choose(user, 'Download CSV');
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/^neocom-market-sell-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(spy.mock.calls[0][1]).toContain('"Cap Booster 200",80');
  });

  it('downloads an xlsx', async () => {
    const spy = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sell orders actions' }), {
      button: 0,
      pointerType: 'mouse',
    });
    await openExportSub(user);
    await choose(user, 'Download Excel (.xlsx)');
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/\.xlsx$/);
  });
});

describe('DataTable exportable', () => {
  it('gives a table without row menus a right-click Export submenu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.contextMenu(screen.getByRole('table'));
    await openExportSub(user);
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

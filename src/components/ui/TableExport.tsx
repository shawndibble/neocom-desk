/**
 * One export entry point for every table: an "Export table ▸" submenu
 * (CSV / Excel / copy-for-Sheets) that renders the same in a right-click
 * menu, a row's "More actions" dropdown, and the table block's own ⋯
 * `TableActionsMenu` in its title bar.
 *
 * Wiring a DataTable:
 *
 *   const tableExport = useTableExport({ surface: 'orders-open', rows, columns });
 *   <Panel actions={<TableActionsMenu name={title} tableExport={tableExport} />}>
 *     <DataTable {...tableExport.tableProps} rows={rows} … />
 *
 * `tableProps` hands DataTable the config (so its row menus — or, with none,
 * a table-wide right-click menu — grow the submenu) and a ref back to its
 * sorted rows, so every entry point exports exactly what is on screen.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { exportRows, type ExportFormat } from '@/lib/downloadCsv';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from './RowActions';
import { MenuKindContext } from './rowActionsContext';
import { useTableExportContext, type TableExport } from './useTableExport';

async function run<T>(tableExport: TableExport<T>, format: ExportFormat): Promise<number> {
  const rows = tableExport.getRows();
  await exportRows(format, tableExport.surface, rows, tableExport.columns, {
    truncated: tableExport.truncated,
    qualifier: tableExport.qualifier,
  });
  return rows.length;
}

/**
 * The submenu itself. Kind-agnostic (`MenuSub`/`MenuItem`), so it drops into
 * a context menu or a dropdown alike. `onDone` hears the format and row count
 * after a successful export — the header button uses it to confirm a copy.
 */
export function ExportTableSub<T>({
  tableExport,
  onDone,
}: {
  tableExport: TableExport<T>;
  onDone?: (format: ExportFormat, rowCount: number) => void;
}) {
  const { t } = useTranslation();
  const select = (format: ExportFormat) => {
    // Started inside the select handler, while the document still has focus:
    // the clipboard write is refused once focus has moved on.
    run(tableExport, format).then(
      (count) => onDone?.(format, count),
      (error: unknown) => console.error(t('common.tableExport.failed'), error)
    );
  };
  return (
    <MenuSub>
      <MenuSubTrigger>
        <Icon.Download aria-hidden="true" size={Icon.ICON_SIZE.sm} />
        {t('common.tableExport.exportTable')}
      </MenuSubTrigger>
      <MenuSubContent>
        <MenuItem onSelect={() => select('csv')}>{t('common.tableExport.csv')}</MenuItem>
        <MenuItem onSelect={() => select('xlsx')}>{t('common.tableExport.xlsx')}</MenuItem>
        <MenuItem onSelect={() => select('clipboard')}>
          {t('common.tableExport.clipboard')}
        </MenuItem>
      </MenuSubContent>
    </MenuSub>
  );
}

/** Appends the submenu (after a separator) to a row menu inside an exportable table. */
export function RowExportItems() {
  const tableExport = useTableExportContext();
  if (!tableExport) return null;
  return (
    <>
      <MenuSeparator />
      <ExportTableSub tableExport={tableExport} />
    </>
  );
}

/**
 * The table block's own ⋯ menu, for its title bar. `children` are any
 * table-level items that belong above Export (a caller's existing actions).
 */
export function TableActionsMenu<T>({
  name,
  tableExport,
  children,
  size = 'sm',
}: {
  /** What the table is, for the button's accessible name ("Open orders actions"). */
  name: string;
  tableExport: TableExport<T>;
  children?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<number | null>(null);
  const label = t('common.tableExport.menuLabel', { name });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={
            copied === null ? (
              <Icon.More size={Icon.ICON_SIZE.sm} />
            ) : (
              <Icon.Done size={Icon.ICON_SIZE.sm} />
            )
          }
          label={copied === null ? label : t('common.tableExport.copied', { count: copied })}
          size={size}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <MenuKindContext.Provider value="dropdown">
          {children}
          {children ? <MenuSeparator /> : null}
          <ExportTableSub
            tableExport={tableExport}
            onDone={(format, count) => {
              if (format !== 'clipboard') return;
              setCopied(count);
              setTimeout(() => setCopied(null), 2000);
            }}
          />
        </MenuKindContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

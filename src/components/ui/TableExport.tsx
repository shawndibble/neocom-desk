/**
 * One export entry point for every table: CSV / Excel / copy-for-Sheets.
 * Where export is a menu's only job — the title bar's `TableActionsMenu`
 * with no other table actions, a table's own right-click menu — the three
 * formats are the menu, behind a download button. Where it shares the menu
 * with other actions (a row's right-click menu and "More actions" dropdown,
 * a `TableActionsMenu` given `children`) they sit in an "Export table ▸"
 * submenu.
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { exportRows, type ExportFormat } from '@/lib/downloadCsv';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from './RowActions';
import { MenuKindContext, RowMenuExtrasContext } from './rowActionsContext';
import { TableExportContext, useTableExportContext, type TableExport } from './useTableExport';

async function run<T>(tableExport: TableExport<T>, format: ExportFormat): Promise<number> {
  const rows = tableExport.getRows();
  await exportRows(format, tableExport.surface, rows, tableExport.columns, {
    truncated: tableExport.truncated,
    qualifier: tableExport.qualifier,
  });
  return rows.length;
}

interface ExportItemsProps<T> {
  tableExport: TableExport<T>;
  /**
   * Hears the format and row count after a successful export — the header
   * button uses it to confirm a copy.
   */
  onDone?: (format: ExportFormat, rowCount: number) => void;
}

/**
 * The three formats as flat items, for a menu whose only job is export.
 * Kind-agnostic (`MenuItem`), so it drops into a context menu or a dropdown
 * alike.
 */
export function ExportTableItems<T>({ tableExport, onDone }: ExportItemsProps<T>) {
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
    <>
      <MenuItem onSelect={() => select('csv')}>{t('common.tableExport.csv')}</MenuItem>
      <MenuItem onSelect={() => select('xlsx')}>{t('common.tableExport.xlsx')}</MenuItem>
      <MenuItem onSelect={() => select('clipboard')}>{t('common.tableExport.clipboard')}</MenuItem>
    </>
  );
}

/** The same items in an "Export table ▸" submenu, for a menu that has other actions too. */
export function ExportTableSub<T>(props: ExportItemsProps<T>) {
  const { t } = useTranslation();
  return (
    <MenuSub>
      <MenuSubTrigger>
        <Icon.Download aria-hidden="true" size={Icon.ICON_SIZE.sm} />
        {t('common.tableExport.exportTable')}
      </MenuSubTrigger>
      <MenuSubContent>
        <ExportTableItems {...props} />
      </MenuSubContent>
    </MenuSub>
  );
}

/**
 * What `DataTable`'s `exportable` does for its rows, for a table that isn't a
 * DataTable (a virtualized list, a raw `<table>`): every `RowActionsMenu`
 * under it gains the "Export table" submenu.
 */
export function TableExportProvider<T>({
  tableExport,
  children,
}: {
  tableExport: TableExport<T>;
  children: ReactNode;
}) {
  return (
    <TableExportContext.Provider value={tableExport}>
      <RowMenuExtrasContext.Provider value={ROW_EXPORT_ITEMS}>
        {children}
      </RowMenuExtrasContext.Provider>
    </TableExportContext.Provider>
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
 * One element for every provider: a fresh one per render would change the
 * context value and re-render every row menu in a long (virtualized) list.
 */
const ROW_EXPORT_ITEMS = <RowExportItems />;

/**
 * The table block's own menu, for its title bar. With no `children` it is an
 * export button: a download icon opening the three formats. `children` are
 * table-level actions that belong above Export; with them it becomes a ⋯
 * menu and Export moves into its submenu.
 */
export function TableActionsMenu<T>({
  name,
  tableExport,
  children,
  size = 'sm',
}: {
  /** What the table is, for the button's accessible name ("Export Open orders"). */
  name: string;
  tableExport: TableExport<T>;
  children?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<number | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const exportOnly = !children;
  const label = exportOnly
    ? t('common.tableExport.exportButtonLabel', { name })
    : t('common.tableExport.menuLabel', { name });
  const onDone = (format: ExportFormat, count: number) => {
    if (format !== 'clipboard') return;
    setCopied(count);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={
            copied !== null ? (
              <Icon.Done size={Icon.ICON_SIZE.sm} />
            ) : exportOnly ? (
              <Icon.Download size={Icon.ICON_SIZE.sm} />
            ) : (
              <Icon.More size={Icon.ICON_SIZE.sm} />
            )
          }
          label={copied === null ? label : t('common.tableExport.copied', { count: copied })}
          size={size}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <MenuKindContext.Provider value="dropdown">
          {exportOnly ? (
            <ExportTableItems tableExport={tableExport} onDone={onDone} />
          ) : (
            <>
              {children}
              <MenuSeparator />
              <ExportTableSub tableExport={tableExport} onDone={onDone} />
            </>
          )}
        </MenuKindContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

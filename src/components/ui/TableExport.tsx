/**
 * One export entry point for every table: CSV / Excel / copy-for-Sheets.
 * Where export is a menu's only job — the title bar's `TableActionsMenu`
 * with no other table actions, a table's own right-click menu — the three
 * formats are the menu, behind a download button. Where it shares the menu
 * with other actions (a `TableActionsMenu` given `children`) they sit in an
 * "Export table ▸" submenu. A row's menu never carries export: it is a table
 * action, so it lives in the table's own actions menu, not on every row.
 *
 * Wiring a DataTable:
 *
 *   const tableExport = useTableExport({ surface: 'orders-open', rows, columns });
 *   <Panel actions={<TableActionsMenu name={title} tableExport={tableExport} />}>
 *     <DataTable {...tableExport.tableProps} rows={rows} … />
 *
 * `tableProps` hands DataTable the config (so a table with no row menus gets
 * a table-wide right-click menu of the formats) and a ref back to its sorted
 * rows, so every entry point exports exactly what is on screen.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { exportRows, type ExportFormat } from '@/lib/downloadCsv';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './DropdownMenu';
import { Button } from './Button';
import { LiveStatus } from './LiveStatus';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from './RowActions';
import { MenuKindContext } from './rowActionsContext';
import type { TableExport } from './useTableExport';

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
  // The items exist only while a menu is open: opening one is the intent to export.
  const { onExportIntent } = tableExport;
  useEffect(() => onExportIntent?.(), [onExportIntent]);
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
  label: labelOverride,
  triggerText,
  onCloseAutoFocus,
}: {
  /** What the table is, for the button's accessible name ("Export Open orders"). */
  name: string;
  tableExport: TableExport<T>;
  children?: ReactNode;
  size?: 'sm' | 'md';
  /** Replaces the default "<name> actions" button name when the menu is a page's named tools menu. */
  label?: string;
  /** Shows the word on the trigger (grid icon, text, caret) instead of a bare ⋯ icon: a page's named Tools menu. */
  triggerText?: string;
  /** From `useOpenAfterMenu`, for a child item that opens a dialog. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<number | null>(null);
  // Bumped per copy so a second copy of the same count within 2s is read again.
  const [copyCount, setCopyCount] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const exportOnly = !children;
  const label =
    labelOverride ??
    (exportOnly
      ? t('common.tableExport.exportButtonLabel', { name })
      : t('common.tableExport.menuLabel', { name }));
  // An `md` button sits in a toolbar beside other md controls (a column
  // picker), whose glyphs are md too.
  const iconSize = size === 'md' ? Icon.ICON_SIZE.md : Icon.ICON_SIZE.sm;
  const onDone = (format: ExportFormat, count: number) => {
    if (format !== 'clipboard') return;
    setCopied(count);
    setCopyCount((n) => n + 1);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };
  return (
    <>
      {/* Before the menu: keeps the trigger the last child for callers' space-x-* rules. */}
      <LiveStatus announceKey={copyCount}>
        {copied !== null && t('common.tableExport.copied', { count: copied })}
      </LiveStatus>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {triggerText ? (
            <Button
              size={size}
              aria-label={
                copied === null ? label : t('common.tableExport.copied', { count: copied })
              }
            >
              {copied !== null ? <Icon.Done size={iconSize} /> : <Icon.CardsView size={iconSize} />}
              <span aria-hidden>{triggerText}</span>
              <Icon.Expanded size={iconSize} />
            </Button>
          ) : (
            <IconButton
              icon={
                copied !== null ? (
                  <Icon.Done size={iconSize} />
                ) : exportOnly ? (
                  <Icon.Download size={iconSize} />
                ) : (
                  <Icon.More size={iconSize} />
                )
              }
              label={copied === null ? label : t('common.tableExport.copied', { count: copied })}
              size={size}
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
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
    </>
  );
}

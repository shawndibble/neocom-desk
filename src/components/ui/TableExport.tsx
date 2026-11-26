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
  onDone?: (format: ExportFormat, rowCount: number) => void;
}

export function ExportTableItems<T>({ tableExport, onDone }: ExportItemsProps<T>) {
  const { t } = useTranslation();
  const { onExportIntent } = tableExport;
  useEffect(() => onExportIntent?.(), [onExportIntent]);
  const select = (format: ExportFormat) => {
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

export function TableActionsMenu<T>({
  name,
  tableExport,
  children,
  size = 'sm',
  label: labelOverride,
  triggerText,
  onCloseAutoFocus,
}: {
  name: string;
  tableExport: TableExport<T>;
  children?: ReactNode;
  size?: 'sm' | 'md';
  label?: string;
  triggerText?: string;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<number | null>(null);
  const [copyCount, setCopyCount] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const exportOnly = !children;
  const label =
    labelOverride ??
    (exportOnly
      ? t('common.tableExport.exportButtonLabel', { name })
      : t('common.tableExport.menuLabel', { name }));
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

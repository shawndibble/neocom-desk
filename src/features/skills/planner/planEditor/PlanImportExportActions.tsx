import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import { PlanConfirmation } from './PlanConfirmation';
import type { usePlanExport } from './usePlanExport';
import type { usePlanImport } from './usePlanImport';

/**
 * Import/Export: the route's page-level actions cluster, "far top right corner" like every
 * other route (Wallet.tsx, Assets.tsx) — portaled in because the route owns that DOM slot
 * but the handlers and the data they act on (scheduled, catalog) live with the editor.
 */
export function PlanImportExportActions({
  container,
  imports,
  exporter,
}: {
  container: HTMLElement;
  imports: ReturnType<typeof usePlanImport>;
  exporter: ReturnType<typeof usePlanExport>;
}) {
  const { t } = useTranslation();
  const {
    importMenuOpen,
    setImportMenuOpen,
    queueImporting,
    openImportDialogAfterMenuRef,
    setImportOpen,
    handleImport,
    importConfirm,
    undoImport,
    undoQueueImportReplace,
    importError,
  } = imports;
  const {
    copyConfirm,
    exportMenuOpen,
    setExportMenuOpen,
    handleExport,
    handleExportQueue,
    queueRowCount,
  } = exporter;
  return createPortal(
    <>
      <DropdownMenu open={importMenuOpen} onOpenChange={setImportMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="md" disabled={queueImporting}>
            <Icon.ImportClipboard aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {t('plans.import')}
            <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={() => {
            // Open the dialog only once the menu has handed focus back to
            // the trigger: the native <dialog> records the focused
            // element to restore on close, and that must be the trigger,
            // not a menu item that is about to unmount.
            if (openImportDialogAfterMenuRef.current) {
              openImportDialogAfterMenuRef.current = false;
              setImportOpen(true);
            }
          }}
        >
          <DropdownMenuItem onSelect={() => void handleImport()}>
            {t('plans.importFromQueueItem')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              openImportDialogAfterMenuRef.current = true;
            }}
          >
            {t('plans.importFromTextOrFileItem')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="md">
            <Icon.Export aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {t('plans.export')}
            <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              // Keep the menu open (skip Radix's default auto-close)
              // until the write settles, then close it ourselves:
              // closing first moves focus back to the trigger as part
              // of the same transition, and writeText() called
              // mid-transition can throw "Document is not focused"
              // (NotAllowedError).
              event.preventDefault();
              void handleExport().finally(() => setExportMenuOpen(false));
            }}
          >
            {t('plans.exportClipboard')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handleExportQueue('csv')}
            disabled={queueRowCount === 0}
          >
            {t('plans.exportCsvQueue')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handleExportQueue('xlsx')}
            disabled={queueRowCount === 0}
          >
            {t('plans.exportXlsxQueue')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void handleExportQueue('clipboard')}
            disabled={queueRowCount === 0}
          >
            {t('plans.exportSheetsQueue')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Beside the buttons that produced them, not down in the entries
          panel — a confirmation/error disconnected from its trigger
          reads as belonging to something else. */}
      {copyConfirm && <PlanConfirmation message={t('plans.exportCopied')} />}
      {importConfirm && (
        <PlanConfirmation
          message={importConfirm}
          action={
            undoImport && (
              <Button size="md" variant="ghost" onClick={undoQueueImportReplace}>
                {t('plans.importQueueUndo')}
              </Button>
            )
          }
        />
      )}
      {importError && <InlineError>{importError}</InlineError>}
    </>,
    container
  );
}

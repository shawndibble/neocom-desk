import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { HeaderMoreMenu } from '@/components/ui/HeaderMoreMenu';
import { useIsPhone } from '@/lib/useIsPhone';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import { ExportTableSub } from '@/components/ui/TableExport';
import { MenuKindContext } from '@/components/ui/rowActionsContext';
import { PlanConfirmation } from './PlanConfirmation';
import type { usePlanExport } from './usePlanExport';
import type { usePlanImport } from './usePlanImport';

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
    handleTableDone,
    tableExport,
  } = exporter;
  const isPhone = useIsPhone();
  const exportClipboard = (event: Event) => {
    event.preventDefault();
    void handleExport().finally(() => setExportMenuOpen(false));
  };
  const feedback = (
    <>
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
    </>
  );
  if (isPhone) {
    return createPortal(
      <>
        {feedback}
        <HeaderMoreMenu
          open={exportMenuOpen}
          onOpenChange={setExportMenuOpen}
          onCloseAutoFocus={() => {
            if (openImportDialogAfterMenuRef.current) {
              openImportDialogAfterMenuRef.current = false;
              setImportOpen(true);
            }
          }}
        >
          <DropdownMenuItem disabled={queueImporting} onSelect={() => void handleImport()}>
            {t('plans.importFromQueueItem')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              openImportDialogAfterMenuRef.current = true;
            }}
          >
            {t('plans.importFromTextOrFileItem')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportClipboard}>
            {t('plans.exportClipboard')}
          </DropdownMenuItem>
          <MenuKindContext.Provider value="dropdown">
            <ExportTableSub tableExport={tableExport} onDone={handleTableDone} />
          </MenuKindContext.Provider>
        </HeaderMoreMenu>
      </>,
      container
    );
  }
  return createPortal(
    <>
      <DropdownMenu
        open={importMenuOpen}
        onOpenChange={(next) => setImportMenuOpen(next && !queueImporting)}
      >
        <DropdownMenuTrigger asChild>
          <Button size="md" loading={queueImporting}>
            <Icon.ImportClipboard aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {t('plans.import')}
            <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={() => {
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
          <DropdownMenuItem onSelect={exportClipboard}>
            {t('plans.exportClipboard')}
          </DropdownMenuItem>
          <MenuKindContext.Provider value="dropdown">
            <ExportTableSub tableExport={tableExport} onDone={handleTableDone} />
          </MenuKindContext.Provider>
        </DropdownMenuContent>
      </DropdownMenu>
      {feedback}
    </>,
    container
  );
}

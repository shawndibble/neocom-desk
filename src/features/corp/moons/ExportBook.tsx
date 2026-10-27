/**
 * The Corp Tax Book export (#4946), a sheet per record type. Any officer who can open the book
 * can export it: the same reads the book makes, re-read at the press so a copy taken just before
 * a delete is current.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { downloadWorkbook, type WorkbookDownload } from '@/lib/downloadCsv';
import { corpTickerOrId } from '../corpTicker';
import { readAudit, readBookData, readDeclinedAutoGroup, readRebills } from '../taxBook/bookClient';
import { WorkbookDownloadButton } from '../WorkbookDownloadButton';
import { bookExportSheets } from './bookExport';
import { useBook } from './useBook';

/** The newest audit entries the export carries; the log is never read whole. */
const EXPORT_AUDIT_LIMIT = 2000;

function useExportBook(): () => Promise<WorkbookDownload> {
  const { t } = useTranslation();
  const { characterId, corporationId, names } = useBook();
  return useCallback(async () => {
    const [data, audit, rebills, declinedAutoGroup, ticker] = await Promise.all([
      readBookData(characterId, corporationId),
      readAudit(characterId, corporationId, EXPORT_AUDIT_LIMIT),
      readRebills(characterId, corporationId),
      readDeclinedAutoGroup(characterId, corporationId),
      corpTickerOrId(corporationId),
    ]);
    if (!data) throw new Error('The corporation has no Corp Tax Book.');
    const { state } = data;
    const sheets = bookExportSheets(
      {
        settings: data.settings,
        miners: state.miners,
        observed: data.observed,
        statements: state.statements,
        paidStatementIds: state.paidStatementIds,
        payments: state.payments,
        adjustments: data.adjustments,
        writeOffs: state.writeOffs ?? [],
        dismissals: state.dismissals,
        declarations: data.declarations,
        rebills,
        groupingAnswers: data.groupingAnswers ?? [],
        declinedAutoGroup: [...declinedAutoGroup],
        extractions: state.extractions,
        feeders: data.feeders ?? [],
        audit,
        scheduledSync: data.scheduledSync,
      },
      names,
      t
    );
    return downloadWorkbook('corp-tax-book', sheets, { qualifier: ticker });
  }, [characterId, corporationId, names, t]);
}

function ExportBlock({
  id,
  title,
  hint,
  onBusyChange,
}: {
  id: string;
  title: string;
  hint: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const build = useExportBook();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className={eyebrowClassName}>
        {title}
      </h3>
      <p className="text-xs text-text-dim">{hint}</p>
      <WorkbookDownloadButton
        label={t('corpTaxBook.export.action')}
        build={build}
        onBusyChange={onBusyChange}
      />
      <p className="text-xs text-text-dim">{t('corpTaxBook.export.sheetList')}</p>
    </section>
  );
}

/** "Export the book" on the settings' Access tab, above Delete the book. */
export function ExportBookSection() {
  const { t } = useTranslation();
  return (
    <ExportBlock
      id="export-book-heading"
      title={t('corpTaxBook.export.title')}
      hint={t('corpTaxBook.export.hint')}
    />
  );
}

/**
 * The Delete the book confirmation's offer to keep a copy. Delete never requires it, but holds
 * while a copy is being read, so the file is never cut short by the delete.
 */
export function ExportFirst({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <ExportBlock
      id="export-first-heading"
      title={t('corpTaxBook.export.firstTitle')}
      hint={t('corpTaxBook.export.firstHint')}
      onBusyChange={onBusyChange}
    />
  );
}

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { downloadWorkbook, type WorkbookDownload } from '@/lib/downloadCsv';
import { corpTickerOrId } from '../corpTicker';
import { readAudit, readDeclinedAutoGroup, readRebills } from '../taxBook/bookClient';
import { bookPartsFor, readBook } from '../taxBook/bookRead';
import { WorkbookDownloadButton } from '../WorkbookDownloadButton';
import { bookExportSheets } from './bookExport';
import { useBook } from './useBook';

const EXPORT_AUDIT_LIMIT = 2000;

function useExportBook(): () => Promise<WorkbookDownload> {
  const { t } = useTranslation();
  const { characterId, corporationId, names } = useBook();
  return useCallback(async () => {
    const [data, audit, rebills, declinedAutoGroup, ticker] = await Promise.all([
      readBook(characterId, corporationId, { parts: bookPartsFor() }),
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
        notices: state.notices,
        checkpoints: data.checkpoints ?? [],
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
    return downloadWorkbook('corp-tax-book', sheets, {
      qualifier: ticker,
      truncated: audit.length >= EXPORT_AUDIT_LIMIT,
    });
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
    </section>
  );
}

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

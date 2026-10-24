/** One dataset, one format: a download button, not a menu (decision `20261024-094549`). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { NeedsConnection } from '@/components/ui/NeedsConnection';
import { ActionResult } from '@/features/settings/settingsFields';
import { cx } from '@/lib/cx';
import type { WorkbookDownload } from '@/lib/downloadCsv';

type Outcome = { kind: 'done'; result: WorkbookDownload } | { kind: 'failed' } | null;

export function WorkbookDownloadButton({
  label,
  build,
  className,
  onBusyChange,
}: {
  label: string;
  /** Reads the data, writes the workbook and starts the download. */
  build: () => Promise<WorkbookDownload>;
  className?: string;
  /** Fires around the build, so a caller can hold an action that would cut the copy short. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const run = async () => {
    setBusy(true);
    onBusyChange?.(true);
    setOutcome(null);
    try {
      setOutcome({ kind: 'done', result: await build() });
    } catch {
      setOutcome({ kind: 'failed' });
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div className={cx('grid justify-items-start gap-1 max-sm:justify-items-stretch', className)}>
      <NeedsConnection>
        <Button size="sm" loading={busy} onClick={() => void run()}>
          <Icon.Download size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {label}
        </Button>
      </NeedsConnection>
      {outcome?.kind === 'done' && (
        <ActionResult kind="success">
          {t('corp.dataExport.done', {
            file: outcome.result.filename,
            sheets: t('corp.dataExport.sheets', { count: outcome.result.sheets }),
            rows: t('corp.dataExport.rows', { count: outcome.result.rows }),
          })}
        </ActionResult>
      )}
      {outcome?.kind === 'failed' && (
        <ActionResult kind="error">{t('corp.dataExport.failed')}</ActionResult>
      )}
    </div>
  );
}

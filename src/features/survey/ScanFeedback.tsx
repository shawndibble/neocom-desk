/**
 * What a paste did, said in one line under the page's help text. There is no
 * paste box any more (a scan is pasted anywhere on the page), so a failed paste
 * needs somewhere to be told. `useScanFeedback` (own file) wraps a page's `add`
 * and keeps the last outcome; `ScanFeedback` renders it, empty when all is well.
 */
import { useTranslation } from 'react-i18next';
import type { AddScanResult } from './scanResult';

export function ScanFeedback({ busy, error }: { busy: boolean; error: AddScanResult | null }) {
  const { t } = useTranslation();
  return (
    <>
      <p role="status" className="empty:hidden text-xs text-text-dim">
        {busy && t('survey.adding')}
      </p>
      {error !== null && (
        <p role="alert" className="text-xs text-danger">
          {error === 'not-a-scan' && t('survey.notAScan')}
          {error === 'too-large' && t('survey.tooLarge')}
          {error === 'refused' && t('survey.refused')}
          {error === 'failed' && t('survey.saveFailed')}
        </p>
      )}
    </>
  );
}

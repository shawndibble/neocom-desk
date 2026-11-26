import { useTranslation } from 'react-i18next';
import { InlineError } from '@/components/ui/InlineError';
import type { AddScanResult } from './scanResult';

export function ScanFeedback({ busy, error }: { busy: boolean; error: AddScanResult | null }) {
  const { t } = useTranslation();
  return (
    <>
      <p role="status" className="empty:hidden text-xs text-text-dim">
        {busy && t('survey.adding')}
      </p>
      {error !== null && (
        <InlineError>
          {error === 'not-a-scan' && t('survey.notAScan')}
          {error === 'too-large' && t('survey.tooLarge')}
          {error === 'refused' && t('survey.refused')}
          {error === 'failed' && t('survey.saveFailed')}
        </InlineError>
      )}
    </>
  );
}

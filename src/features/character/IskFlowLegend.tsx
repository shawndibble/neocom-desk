import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The In / Out key under a daily flow chart, with an optional trailing hint. */
export function IskFlowLegend({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <p className="flex flex-wrap gap-x-4 text-xs text-text-dim">
      <span>
        <span aria-hidden className="mr-1 inline-block size-2 rounded-xs bg-isk-pos" />
        {t('wallet.journalFlowLegendIn')}
      </span>
      <span>
        <span aria-hidden className="mr-1 inline-block size-2 rounded-xs bg-isk-neg" />
        {t('wallet.journalFlowLegendOut')}
      </span>
      {children}
    </p>
  );
}

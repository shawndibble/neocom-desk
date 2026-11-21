import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';

/** The divider's one line and its hint: what the lock date is, and how to fix a locked day. */
export function LockDividerLine({ date }: { date: string }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-dim">
      <span>{t('miningTax.ledger.lockDivider', { date })}</span>
      <InfoTooltip
        label={t('miningTax.ledger.lockDividerLabel')}
        content={t('miningTax.ledger.lockDividerTip', { date })}
        glyph="info"
      />
    </span>
  );
}

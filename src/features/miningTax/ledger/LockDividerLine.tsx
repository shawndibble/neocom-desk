import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';

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

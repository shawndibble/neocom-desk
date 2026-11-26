import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import type { AppraisalTotals } from '@/engine/market/appraisal';
import { formatCubicMetres } from '@/lib/volume';

export function AppraisalVolumeChip({
  totals,
  emphasis = false,
}: {
  totals: Pick<AppraisalTotals, 'volume' | 'volumeUnknownRows'>;
  emphasis?: boolean;
}) {
  const { t } = useTranslation();
  const partial = totals.volumeUnknownRows > 0;
  const value = formatCubicMetres(totals.volume);
  const help = t('market.appraisal.totalVolumeHelp');
  return (
    <StatChip
      label={t('market.appraisal.totalVolume')}
      emphasis={emphasis}
      value={
        partial
          ? t('market.appraisal.totalVolumePartialValue', { value })
          : t('market.appraisal.totalVolumeValue', { value })
      }
      tone={partial ? 'warning' : 'default'}
      tooltip={
        partial
          ? `${help} ${t('market.appraisal.totalVolumePartial', { count: totals.volumeUnknownRows })}`
          : help
      }
    />
  );
}

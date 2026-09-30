import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import type { AppraisalTotals } from '@/engine/market/appraisal';
import { formatCubicMetres } from './appraisalVolume';

/**
 * The Appraisal's Total volume tile (issue #2337): packaged m³ over every row
 * with a known volume. When any row's volume is unknown the figure reads
 * "≈", turns warning-toned and its tooltip says how many rows it leaves out —
 * a partial total is labelled, never passed off as the whole pile.
 */
export function AppraisalVolumeChip({
  totals,
}: {
  totals: Pick<AppraisalTotals, 'volume' | 'volumeUnknownRows'>;
}) {
  const { t } = useTranslation();
  const partial = totals.volumeUnknownRows > 0;
  const value = formatCubicMetres(totals.volume);
  const help = t('market.appraisal.totalVolumeHelp');
  return (
    <StatChip
      label={t('market.appraisal.totalVolume')}
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

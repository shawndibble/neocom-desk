/**
 * The Appraisal's m³ column (issue #2337), shared by the live tab
 * (`AppraisalPanel`) and the read-only share view
 * (`features/market/AppraisalShareScreen.tsx`) so the two read the same. The Total volume
 * tile beside it is `AppraisalVolumeChip`.
 *
 * Volume is packaged m³ — what a hauler's hold actually takes. A row with no
 * known volume is a dash, never 0 m³.
 */
import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import type { AppraisalRow } from '@/engine/market/appraisal';
import { formatCubicMetres } from '@/lib/volume';

export function appraisalVolumeColumn(t: TFunction): DataTableColumn<AppraisalRow> {
  return {
    id: 'volume',
    header: t('market.appraisal.columnVolume'),
    align: 'right',
    className: 'whitespace-nowrap tabular-nums text-text-dim',
    render: (row) => (row.volume === null ? '—' : formatCubicMetres(row.volume)),
    sortValue: (row) => row.volume ?? undefined,
    stackAffix: { after: ` ${t('market.appraisal.volumeUnit')}` },
  };
}

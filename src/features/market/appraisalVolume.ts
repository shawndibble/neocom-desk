/**
 * The Appraisal's m³ column (issue #2337), shared by the live tab
 * (`AppraisalPanel`) and the read-only share view
 * (`routes/AppraisalShared.tsx`) so the two read the same. The Total volume
 * tile beside it is `AppraisalVolumeChip`.
 *
 * Volume is packaged m³ — what a hauler's hold actually takes. A row with no
 * known volume is a dash, never 0 m³.
 */
import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import type { AppraisalRow } from '@/engine/market/appraisal';

const CUBIC_METRES_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/** m³, thousands-separated, to at most two decimals — a stack of ammo is often under 1 m³. */
export function formatCubicMetres(value: number): string {
  return CUBIC_METRES_FORMAT.format(value);
}

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

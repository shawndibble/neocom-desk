import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import { iskPerM3, type AppraisalRow } from '@/engine/market/appraisal';
import { formatIskAuto } from '@/lib/isk';
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

export function appraisalIskPerM3Column(t: TFunction): DataTableColumn<AppraisalRow> {
  return {
    id: 'iskPerM3',
    header: t('market.appraisal.columnIskPerM3'),
    align: 'right',
    className: 'whitespace-nowrap tabular-nums text-text-dim',
    render: (row) => {
      const rate = iskPerM3(row);
      return rate === null ? '—' : formatIskAuto(rate);
    },
    sortValue: (row) => iskPerM3(row) ?? undefined,
  };
}
